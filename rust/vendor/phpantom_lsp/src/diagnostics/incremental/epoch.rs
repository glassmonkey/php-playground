//! Whether anything besides a file's own edits changed since its last
//! slow pass.
//!
//! A partial pass keeps the diagnostics of every function the edit did not
//! touch, which is only sound while everything those diagnostics were
//! computed against is still what it was: the classes of the other files,
//! the configuration, the Laravel registries.  Every publication to the
//! workspace index bumps a generation counter, and each open file's own
//! publications are counted on the side, so a pass can tell its file's own
//! edits (which the partial pass accounts for) from anything else (which
//! forces a full pass).
//!
//! A publication bumps the generation both before and after it writes.  A
//! pass that overlaps one therefore always sees the generation move, even
//! when the publication finishes after the pass does, and never records a
//! result computed half against the old index and half against the new.

use std::collections::HashMap;

use parking_lot::Mutex;

/// The publication counters shared by every clone of a `Backend`.
#[derive(Default)]
pub(crate) struct PublicationEpoch {
    state: Mutex<EpochState>,
}

#[derive(Default)]
struct EpochState {
    /// Bumped at the start and at the end of every publication, and once
    /// after any other change to what a diagnostic can depend on.
    generation: u64,
    /// Publications that have started writing and not yet finished.
    active: u32,
    /// The bumps each file's own publications contributed to
    /// `generation`, for the files a slow pass has taken a snapshot of.
    own: HashMap<String, u64>,
}

/// Where the counters stood when a slow pass started.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct EpochSnapshot {
    generation: u64,
    own: u64,
}

impl EpochSnapshot {
    /// Whether everything that moved the counters between `earlier` and
    /// `self` was the file's own publications.
    pub(crate) fn only_own_changes_since(self, earlier: EpochSnapshot) -> bool {
        self.generation.wrapping_sub(earlier.generation) == self.own.wrapping_sub(earlier.own)
    }
}

/// Holds a publication open until dropped.
pub(crate) struct PublicationGuard<'a> {
    epoch: &'a PublicationEpoch,
    /// The published files that are being tracked.  Usually empty (an
    /// indexing batch) or the one file being edited.
    tracked: Vec<String>,
}

impl Drop for PublicationGuard<'_> {
    fn drop(&mut self) {
        let mut state = self.epoch.state.lock();
        state.generation += 1;
        state.active -= 1;
        for uri in &self.tracked {
            if let Some(own) = state.own.get_mut(uri) {
                *own += 1;
            }
        }
    }
}

impl PublicationEpoch {
    /// Mark the start of a publication of `uris`.  The publication counts as
    /// in progress until the guard is dropped.
    pub(crate) fn begin_publication<'u>(
        &self,
        uris: impl IntoIterator<Item = &'u str>,
    ) -> PublicationGuard<'_> {
        let mut state = self.state.lock();
        state.generation += 1;
        state.active += 1;
        let mut tracked = Vec::new();
        for uri in uris {
            if let Some(own) = state.own.get_mut(uri) {
                *own += 1;
                tracked.push(uri.to_string());
            }
        }
        PublicationGuard {
            epoch: self,
            tracked,
        }
    }

    /// Record a change to project state that is not a file publication: a
    /// configuration reload, a deleted file, a rebuilt registry.
    ///
    /// Call it after the change is written.  A pass that started before the
    /// write then sees the generation move by its next check, and one that
    /// started after it has already read the new state.
    pub(crate) fn note_change(&self) {
        self.state.lock().generation += 1;
    }

    /// Where the counters stand for `uri` right now, or `None` while a
    /// publication is writing (nothing read now can be trusted to describe
    /// one state of the index).
    ///
    /// Starts tracking `uri`'s own publications if it was not tracked yet.
    pub(crate) fn snapshot(&self, uri: &str) -> Option<EpochSnapshot> {
        let mut state = self.state.lock();
        if state.active > 0 {
            return None;
        }
        let generation = state.generation;
        let own = *state.own.entry(uri.to_string()).or_insert(0);
        Some(EpochSnapshot { generation, own })
    }

    /// Whether nothing at all was published or changed since `snapshot`.
    pub(crate) fn unchanged_since(&self, snapshot: EpochSnapshot) -> bool {
        let state = self.state.lock();
        state.active == 0 && state.generation == snapshot.generation
    }

    /// Stop tracking `uri` (the file was closed).
    pub(crate) fn forget(&self, uri: &str) {
        self.state.lock().own.remove(uri);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const URI: &str = "file:///a.php";

    #[test]
    fn own_publications_are_told_apart_from_the_rest() {
        let epoch = PublicationEpoch::default();
        let base = epoch.snapshot(URI).unwrap();

        drop(epoch.begin_publication([URI]));
        let after_own = epoch.snapshot(URI).unwrap();
        assert!(after_own.only_own_changes_since(base));
        assert!(!epoch.unchanged_since(base));

        drop(epoch.begin_publication(["file:///b.php"]));
        let after_other = epoch.snapshot(URI).unwrap();
        assert!(!after_other.only_own_changes_since(base));
        assert!(!after_other.only_own_changes_since(after_own));
    }

    #[test]
    fn a_change_that_is_not_a_publication_counts_as_someone_elses() {
        let epoch = PublicationEpoch::default();
        let base = epoch.snapshot(URI).unwrap();
        epoch.note_change();
        assert!(!epoch.snapshot(URI).unwrap().only_own_changes_since(base));
    }

    #[test]
    fn no_snapshot_is_taken_while_a_publication_is_writing() {
        let epoch = PublicationEpoch::default();
        let base = epoch.snapshot(URI).unwrap();
        let guard = epoch.begin_publication([URI]);
        assert!(epoch.snapshot(URI).is_none());
        assert!(!epoch.unchanged_since(base));
        drop(guard);
        assert!(epoch.snapshot(URI).is_some());
    }

    #[test]
    fn a_publication_overlapping_a_pass_is_seen_even_if_it_ends_later() {
        let epoch = PublicationEpoch::default();
        let guard = epoch.begin_publication(["file:///b.php"]);
        // A pass cannot start in the middle of it...
        assert!(epoch.snapshot(URI).is_none());
        drop(guard);
        // ...and one that started before it sees it by its end check.
        let start = epoch.snapshot(URI).unwrap();
        let guard = epoch.begin_publication([URI]);
        assert!(!epoch.unchanged_since(start));
        drop(guard);
    }

    #[test]
    fn a_forgotten_file_is_no_longer_counted() {
        let epoch = PublicationEpoch::default();
        let base = epoch.snapshot(URI).unwrap();
        epoch.forget(URI);
        drop(epoch.begin_publication([URI]));
        // Untracked again, so its publication reads as someone else's.
        let now = epoch.snapshot(URI).unwrap();
        assert!(!now.only_own_changes_since(base));
    }
}
