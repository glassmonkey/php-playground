import * as React from 'react';
import { Button } from '@chakra-ui/react';
import type { Lesson, LessonBlock, Program } from './types';
import type { TutorialVersion } from './config';
import { useTutorialRunner } from './use-tutorial-runner';

function ReferenceOutput({
	version,
	programId,
	program,
}: {
	version: TutorialVersion;
	programId: string;
	program: Program;
}) {
	const runner = useTutorialRunner(version);
	React.useEffect(() => {
		runner.run(program.code, program.input ?? null);
		// The parent key includes version, source, and input. Reopening keeps this instance.
	}, []);
	return (
		<div
			data-testid="reference-output"
			data-program-id={programId}
			aria-live="polite"
			aria-busy={runner.running}
		>
			{runner.running ? (
				<p>Loading PHP…</p>
			) : runner.error ? (
				<p role="alert">{runner.error}</p>
			) : (
				<pre>{runner.output || '(No output)'}</pre>
			)}
			{runner.running ? (
				<Button
					size="sm"
					whiteSpace="normal"
					height="auto"
					minHeight="8"
					py="2"
					onClick={runner.stop}
				>
					Stop reference run
				</Button>
			) : runner.error ? (
				<Button
					size="sm"
					whiteSpace="normal"
					height="auto"
					minHeight="8"
					py="2"
					onClick={() =>
						runner.run(program.code, program.input ?? null)
					}
				>
					Retry
				</Button>
			) : null}
		</div>
	);
}

function RuntimePanel({
	version,
	programId,
	program,
	label,
	showCode = false,
}: {
	version: TutorialVersion;
	programId: string;
	program: Program;
	label: string;
	showCode?: boolean;
}) {
	const [opened, setOpened] = React.useState(false);
	return (
		<details
			onToggle={(event) => {
				if (event.currentTarget.open) setOpened(true);
			}}
		>
			<summary>{label}</summary>
			{showCode && (
				<pre>
					<code>{program.code}</code>
				</pre>
			)}
			{opened && (
				<ReferenceOutput
					key={JSON.stringify([version, program.code, program.input])}
					version={version}
					programId={programId}
					program={program}
				/>
			)}
		</details>
	);
}

function Block({
	block,
	lesson,
	version,
	activeExperimentId,
	onSelectExperiment,
}: {
	block: LessonBlock;
	lesson: Lesson;
	version: TutorialVersion;
	activeExperimentId: string | null;
	onSelectExperiment: (id: string | null) => void;
}) {
	switch (block.type) {
		case 'paragraph':
			return <p>{block.text}</p>;
		case 'list':
			return (
				<ol>
					{block.items.map((item, index) => (
						<li key={index}>{item}</li>
					))}
				</ol>
			);
		case 'example':
			return (
				<div className="tutorial-example">
					<Button
						size="sm"
						whiteSpace="normal"
						height="auto"
						minHeight="8"
						py="2"
						variant={
							activeExperimentId === null ? 'solid' : 'outline'
						}
						aria-pressed={activeExperimentId === null}
						onClick={() => onSelectExperiment(null)}
					>
						Example
					</Button>
					<pre>
						<code>
							{lesson.programs[lesson.sampleProgramId].code}
						</code>
					</pre>
				</div>
			);
		case 'code':
			return (
				<pre>
					<code>{lesson.programs[block.programId].code}</code>
				</pre>
			);
		case 'runtime-output':
			return (
				<RuntimePanel
					version={version}
					programId={block.programId}
					program={lesson.programs[block.programId]}
					label={block.label}
				/>
			);
		case 'solution':
			return (
				<RuntimePanel
					version={version}
					programId={lesson.exercise.solutionProgramId}
					program={lesson.programs[lesson.exercise.solutionProgramId]}
					label={block.label}
					showCode
				/>
			);
		case 'experiments':
			return (
				<div className="tutorial-experiments">
					{lesson.experiments.map((experiment) => (
						<div
							className="tutorial-experiment"
							key={experiment.id}
						>
							<Button
								size="sm"
								whiteSpace="normal"
								height="auto"
								minHeight="8"
								py="2"
								variant={
									activeExperimentId === experiment.id
										? 'solid'
										: 'outline'
								}
								aria-pressed={
									activeExperimentId === experiment.id
								}
								onClick={() =>
									onSelectExperiment(experiment.id)
								}
							>
								Try {experiment.title}
							</Button>
							<p>{experiment.description}</p>
						</div>
					))}
				</div>
			);
		case 'exercise':
			return (
				<>
					<p>{lesson.exercise.prompt}</p>
					<details>
						<summary>Show a hint</summary>
						<p>{lesson.exercise.hint}</p>
					</details>
				</>
			);
	}
}

export function LessonSections({
	lesson,
	version,
	activeExperimentId,
	onSelectExperiment,
}: {
	lesson: Lesson;
	version: TutorialVersion;
	activeExperimentId: string | null;
	onSelectExperiment: (id: string | null) => void;
}) {
	return (
		<>
			{lesson.sections.map((section) => (
				<section key={section.id} id={section.id}>
					<h2>{section.title}</h2>
					{section.blocks.map((block, index) => (
						<Block
							key={index}
							block={block}
							lesson={lesson}
							version={version}
							activeExperimentId={activeExperimentId}
							onSelectExperiment={onSelectExperiment}
						/>
					))}
				</section>
			))}
		</>
	);
}
