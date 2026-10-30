import { chapters } from './chapters';
import { referenceChapters } from './reference-chapters';
function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
function isText(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}
function isJSONValue(value: unknown, ancestors = new Set<unknown>()): boolean {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean'
	)
		return true;
	if (typeof value === 'number') return Number.isFinite(value);
	if (typeof value !== 'object' || ancestors.has(value)) return false;
	ancestors.add(value);
	const valid =
		(Array.isArray(value) || isRecord(value)) &&
		Object.values(value).every((item) => isJSONValue(item, ancestors));
	ancestors.delete(value);
	return valid;
}

/** Validate author data before the renderer dereferences programs or exercise cases. */
export function validateLesson(value: unknown): string[] {
	const errors: string[] = [];
	if (!isRecord(value)) return ['Lesson must be an object.'];
	if (value.schemaVersion !== 1)
		errors.push('Unsupported lesson schemaVersion; expected 1.');
	for (const key of ['slug', 'title', 'summary', 'goal'])
		if (!isText(value[key]))
			errors.push(`${key} must be a nonempty string.`);
	if (isText(value.slug) && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug))
		errors.push('slug must use lowercase words separated by hyphens.');
	if (!chapters.some((chapter) => chapter.id === value.chapterId))
		errors.push('chapterId must reference a known chapter.');
	if (
		!referenceChapters.some(
			(chapter) => chapter.id === value.referenceChapterId
		)
	)
		errors.push(
			'referenceChapterId must reference a known source chapter.'
		);
	if (!isRecord(value.learning))
		errors.push('learning must contain author review notes.');
	else {
		if (!isText(value.learning.exampleReason))
			errors.push('learning.exampleReason must be nonempty.');
		if (
			!Array.isArray(value.learning.prerequisiteLessons) ||
			!value.learning.prerequisiteLessons.every(isText)
		)
			errors.push(
				'learning.prerequisiteLessons must contain lesson slugs.'
			);
		if (
			!Array.isArray(value.learning.misconceptions) ||
			!value.learning.misconceptions.length ||
			!value.learning.misconceptions.every(
				(item) =>
					isRecord(item) &&
					isText(item.belief) &&
					isText(item.correction)
			)
		)
			errors.push(
				'learning.misconceptions must pair beliefs with corrections.'
			);
	}
	const programs = isRecord(value.programs) ? value.programs : {};
	if (!isRecord(value.programs) || !Object.keys(programs).length)
		errors.push('programs must be a nonempty object.');
	for (const [id, program] of Object.entries(programs)) {
		if (!isText(id) || !isRecord(program) || !isText(program.code)) {
			errors.push(`Program ${id} must contain code.`);
			continue;
		}
		if ('input' in program && !isJSONValue(program.input))
			errors.push(`Program ${id} input must be JSON data.`);
	}
	const reference = (id: unknown, path: string) => {
		if (!isText(id) || !Object.hasOwn(programs, id))
			errors.push(`${path} references a missing program.`);
	};
	reference(value.sampleProgramId, 'sampleProgramId');
	if (!Array.isArray(value.experiments))
		errors.push('experiments must be an array.');
	else {
		const ids = new Set<string>();
		value.experiments.forEach((experiment, index) => {
			if (!isRecord(experiment)) {
				errors.push(`Experiment ${index} must be an object.`);
				return;
			}
			for (const key of ['id', 'title', 'description'])
				if (!isText(experiment[key]))
					errors.push(
						`Experiment ${index} ${key} must be a nonempty string.`
					);
			if (isText(experiment.id)) {
				if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(experiment.id))
					errors.push(
						`Experiment ${index} id must use lowercase words separated by hyphens.`
					);
				if (ids.has(experiment.id))
					errors.push(`Duplicate experiment id: ${experiment.id}.`);
				ids.add(experiment.id);
			}
			reference(experiment.programId, `Experiment ${index} programId`);
			if (!isRecord(experiment.learning))
				errors.push(`Experiment ${index} needs learning notes.`);
			else {
				if (experiment.learning.goalRef !== 'lesson.goal')
					errors.push(
						`Experiment ${index} goalRef must reference lesson.goal.`
					);
				for (const key of ['change', 'observe', 'reason'])
					if (!isText(experiment.learning[key]))
						errors.push(
							`Experiment ${index} learning.${key} must be nonempty.`
						);
			}
		});
	}

	if (!isRecord(value.exercise)) errors.push('exercise must be an object.');
	else {
		reference(value.exercise.starterProgramId, 'exercise.starterProgramId');
		reference(
			value.exercise.solutionProgramId,
			'exercise.solutionProgramId'
		);
		for (const key of ['prompt', 'hint'])
			if (!isText(value.exercise[key]))
				errors.push(`exercise.${key} must be a nonempty string.`);
		if (
			!Array.isArray(value.exercise.cases) ||
			!value.exercise.cases.length
		)
			errors.push('exercise.cases must contain at least one case.');
		else {
			const ids = new Set<string>();
			value.exercise.cases.forEach((test, index) => {
				if (!isRecord(test)) {
					errors.push(`Case ${index} must be an object.`);
					return;
				}
				for (const key of ['id', 'label', 'checkPhp'])
					if (!isText(test[key]))
						errors.push(
							`Case ${index} ${key} must be a nonempty string.`
						);
				if (isText(test.id)) {
					if (ids.has(test.id))
						errors.push(`Duplicate case id: ${test.id}.`);
					ids.add(test.id);
				}
				if (!isJSONValue(test.input))
					errors.push(`Case ${index} input must be JSON data.`);
			});
		}
	}
	if (!Array.isArray(value.sections) || !value.sections.length)
		errors.push('sections must contain at least one section.');
	else {
		const ids = new Set<string>();
		value.sections.forEach((section, index) => {
			if (!isRecord(section)) {
				errors.push(`Section ${index} must be an object.`);
				return;
			}
			if (!isText(section.id))
				errors.push(`Section ${index} needs an id.`);
			else {
				if (ids.has(section.id))
					errors.push(`Duplicate section id: ${section.id}.`);
				ids.add(section.id);
			}
			if (!isText(section.title))
				errors.push(`Section ${index} needs a title.`);
			if (!Array.isArray(section.blocks) || !section.blocks.length) {
				errors.push(`Section ${index} needs blocks.`);
				return;
			}
			section.blocks.forEach((block, position) => {
				const path = `Section ${index} block ${position}`;
				if (!isRecord(block)) {
					errors.push(`${path} must be an object.`);
					return;
				}
				switch (block.type) {
					case 'paragraph':
						if (!isText(block.text))
							errors.push(`${path} needs text.`);
						break;
					case 'list':
						if (
							!Array.isArray(block.items) ||
							!block.items.length ||
							!block.items.every(isText)
						)
							errors.push(`${path} needs nonempty text items.`);
						break;
					case 'code':
						reference(block.programId, path);
						break;
					case 'runtime-output':
						reference(block.programId, path);
						if (!isText(block.label))
							errors.push(`${path} needs a label.`);
						break;
					case 'solution':
						if (!isText(block.label))
							errors.push(`${path} needs a label.`);
						break;
					case 'example':
					case 'experiments':
					case 'exercise':
						break;
					default:
						errors.push(`${path} has an unsupported block type.`);
				}
			});
		});
	}
	if (!Array.isArray(value.references))
		errors.push('references must be an array.');
	else
		value.references.forEach((reference, index) => {
			if (
				!isRecord(reference) ||
				!isText(reference.title) ||
				!isText(reference.url) ||
				!/^https?:\/\//.test(reference.url)
			)
				errors.push(
					`Reference ${index} needs a title and HTTP(S) URL.`
				);
		});
	return errors;
}

export function validateLessons(value: unknown): string[] {
	if (!Array.isArray(value) || !value.length)
		return ['The curriculum must contain lessons.'];
	const ordered = chapters.flatMap((chapter) =>
		value.filter(
			(lesson) => isRecord(lesson) && lesson.chapterId === chapter.id
		)
	);
	const positions = new Map(
		ordered.map((lesson, index) => [lesson.slug, index])
	);
	const ids = new Set<string>();
	return value.flatMap((lesson, index) => {
		const errors = validateLesson(lesson).map(
			(error) => `Lesson ${index + 1}: ${error}`
		);
		if (
			isRecord(lesson) &&
			isRecord(lesson.learning) &&
			Array.isArray(lesson.learning.prerequisiteLessons)
		) {
			for (const prerequisite of lesson.learning.prerequisiteLessons) {
				const before = positions.get(prerequisite);
				const here = positions.get(lesson.slug);
				if (
					before === undefined ||
					here === undefined ||
					before >= here
				)
					errors.push(
						`Lesson ${index + 1}: prerequisite ${prerequisite} must be an earlier lesson in this version.`
					);
			}
		}
		if (isRecord(lesson) && isText(lesson.slug)) {
			if (ids.has(lesson.slug))
				errors.push(`Duplicate lesson slug: ${lesson.slug}.`);
			ids.add(lesson.slug);
		}
		return errors;
	});
}
