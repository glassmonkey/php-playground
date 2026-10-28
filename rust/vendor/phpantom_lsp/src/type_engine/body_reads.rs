//! Which function bodies inference read while a recording was active.
//!
//! Reading a body to type a call to it (a method's return type left open
//! by its declaration, what a by-reference parameter is left holding)
//! makes every diagnostic that used the answer depend on that body.  The
//! incremental diagnostic pass records the reads each slow pass makes, so
//! that an edit to a body something else read re-checks the whole file
//! instead of only the edited function, and so that saving the file a
//! body lives in re-checks the other open files that read it.
//!
//! Every inference that reads a body it is not walking has to report it
//! through [`record`].  A recording collects the reads made on its thread
//! until it is dropped.  It is a collection point, not a gate: it never
//! changes what inference returns.

use std::cell::RefCell;
use std::collections::HashSet;

thread_local! {
    /// `(file URI, name offset)` of each body read, or `None` when this
    /// thread is not recording.
    static READS: RefCell<Option<HashSet<(String, u32)>>> = const { RefCell::new(None) };
}

/// Note that inference read the body of the function or method whose name
/// token starts at `name_offset` in `uri`, if this thread is recording.
pub(crate) fn record(uri: &str, name_offset: u32) {
    READS.with(|cell| {
        let Ok(mut reads) = cell.try_borrow_mut() else {
            return;
        };
        if let Some(reads) = reads.as_mut() {
            reads.insert((uri.to_string(), name_offset));
        }
    });
}

/// An active recording.  Reads made on this thread are collected until it
/// is dropped.
pub(crate) struct BodyReads {
    /// The recording this one suspended, which gets its reads on drop.
    outer: Option<HashSet<(String, u32)>>,
}

/// Start recording body reads on this thread.
pub(crate) fn record_body_reads() -> BodyReads {
    BodyReads {
        outer: READS.with(|cell| cell.borrow_mut().replace(HashSet::new())),
    }
}

impl BodyReads {
    /// The name offsets of the bodies in `uri` read so far.
    pub(crate) fn offsets_in(&self, uri: &str) -> Vec<u32> {
        READS.with(|cell| {
            cell.borrow()
                .iter()
                .flatten()
                .filter(|(read_uri, _)| read_uri == uri)
                .map(|&(_, offset)| offset)
                .collect()
        })
    }

    /// The files other than `uri` with a body read so far.
    pub(crate) fn files_other_than(&self, uri: &str) -> HashSet<String> {
        READS.with(|cell| {
            cell.borrow()
                .iter()
                .flatten()
                .filter(|(read_uri, _)| read_uri != uri)
                .map(|(read_uri, _)| read_uri.clone())
                .collect()
        })
    }
}

impl Drop for BodyReads {
    fn drop(&mut self) {
        READS.with(|cell| {
            let mut slot = cell.borrow_mut();
            let inner = slot.take();
            let mut outer = self.outer.take();
            if let (Some(outer), Some(inner)) = (outer.as_mut(), inner) {
                outer.extend(inner);
            }
            *slot = outer;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_are_collected_only_while_recording() {
        record("file:///a.php", 1);
        let recording = record_body_reads();
        record("file:///a.php", 10);
        record("file:///b.php", 20);
        record("file:///a.php", 10);
        assert_eq!(recording.offsets_in("file:///a.php"), vec![10]);
        assert_eq!(
            recording.files_other_than("file:///a.php"),
            HashSet::from(["file:///b.php".to_string()])
        );
        drop(recording);
        let recording = record_body_reads();
        assert!(recording.offsets_in("file:///a.php").is_empty());
    }

    #[test]
    fn a_nested_recording_hands_its_reads_to_the_outer_one() {
        let outer = record_body_reads();
        {
            let _inner = record_body_reads();
            record("file:///a.php", 5);
        }
        assert_eq!(outer.offsets_in("file:///a.php"), vec![5]);
    }
}
