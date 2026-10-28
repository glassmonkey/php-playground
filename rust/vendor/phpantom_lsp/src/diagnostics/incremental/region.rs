//! The part of a file a partial slow pass reports on.
//!
//! A partial pass re-runs the slow collectors for the functions and
//! methods an edit touched and keeps every other diagnostic from the
//! previous pass.  The collectors learn which part of the file that is
//! from this pass-scoped filter rather than from a parameter on each of
//! them: they ask [`reports_site`] before resolving a site, so the type
//! engine never runs for a site whose diagnostic would be thrown away.
//!
//! The filter is advisory.  The pass drops whatever the collectors report
//! outside the region afterwards, so a collector that does not consult it
//! stays correct and only costs its own run.  The class-level collectors
//! rely on that: they walk class declarations, which sit outside every
//! function body, but report on the methods inside them.
//!
//! Set and cleared within one synchronous slow pass, so it never spans an
//! `.await`.

use std::cell::RefCell;

thread_local! {
    /// The byte ranges `[start, end)` the running slow pass reports on, or
    /// `None` when it reports on the whole file.
    static REGION: RefCell<Option<Vec<(u32, u32)>>> = const { RefCell::new(None) };
}

/// Restricts the slow pass on this thread to a region until dropped.
pub(crate) struct RegionGuard {
    previous: Option<Vec<(u32, u32)>>,
}

impl Drop for RegionGuard {
    fn drop(&mut self) {
        let previous = self.previous.take();
        REGION.with(|region| *region.borrow_mut() = previous);
    }
}

/// Restrict the slow pass on this thread to `ranges`.
pub(crate) fn restrict_to(ranges: Vec<(u32, u32)>) -> RegionGuard {
    RegionGuard {
        previous: REGION.with(|region| region.borrow_mut().replace(ranges)),
    }
}

/// Whether the slow pass running on this thread reports a diagnostic
/// anchored at `offset`.  Always `true` outside a partial pass.
#[inline]
pub(crate) fn reports_site(offset: u32) -> bool {
    REGION.with(|region| {
        region.borrow().as_ref().is_none_or(|ranges| {
            ranges
                .iter()
                .any(|&(start, end)| offset >= start && offset < end)
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_site_is_reported_outside_a_partial_pass() {
        assert!(reports_site(0));
        assert!(reports_site(u32::MAX));
    }

    #[test]
    fn a_partial_pass_reports_only_its_ranges_and_restores_on_drop() {
        {
            let _region = restrict_to(vec![(10, 20), (40, 50)]);
            assert!(!reports_site(9));
            assert!(reports_site(10));
            assert!(reports_site(19));
            assert!(!reports_site(20));
            assert!(reports_site(45));
            assert!(!reports_site(60));
        }
        assert!(reports_site(60));
    }
}
