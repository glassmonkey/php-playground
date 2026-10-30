# Learning chapters and PHP specification references

There are two separate catalogs:

- `src/tutorial/chapters.ts` defines the learner-facing sequence and chapter IDs. `groupLessons` uses this order for index and syllabus; lesson order within each chapter follows the version manifest.
- `src/tutorial/reference-chapters.ts` defines the PHP Manual taxonomy used for specification mapping. Each Lesson has a `referenceChapterId`; official PHP documentation remains the authority for claims about PHP behavior and version support.

## Resolve the learning sequence and reference mapping

For the version under review, read `lessonsByVersion[version]` from `src/tutorial/content.ts` and apply `groupLessons` from `src/tutorial/chapters.ts` to obtain the displayed chapter and lesson order. Resolve each lesson's `referenceChapterId` through `src/tutorial/reference-chapters.ts`. Do not duplicate the chapter, slug, or coverage lists here.

Keep a Lesson's `referenceChapterId` aligned with the official subject it teaches, even when its learner-facing `chapterId` groups it with prerequisite or follow-up material. Confirm the specific claim against the direct official references on the Lesson; a chapter-level mapping alone is not evidence for every claim.

Derive uncovered reference categories by comparing the catalogs with the selected version's lessons. A missing lesson does not establish that PHP/WASM cannot run the feature, and a linked reference chapter does not establish complete coverage of that chapter.

