import * as React from 'react';
import { Button, Select, useColorMode } from '@chakra-ui/react';
import { previewThemeFor } from '../preview-theme';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { compressToEncodedURIComponent } from 'lz-string';
import { lessonsByVersion } from './content';
import {
	isTutorialVersion,
	latestTutorialVersion,
	tutorialVersions,
	type TutorialVersion,
} from './config';
import type { Lesson } from './types';
import { useTutorialRunner } from './use-tutorial-runner';
import ThemeToggle from '../theme-toggle';
import './tutorial.css';
import { LessonSections } from './lesson-sections';
import { validateLessons } from './validate-content';
import { chapters, groupLessons } from './chapters';
import { getHomeMetadata, getTutorialMetadata } from './seo';

function TutorialSurface({ children }: { children: React.ReactNode }) {
	const { colorMode } = useColorMode();
	const preview = previewThemeFor(colorMode);
	return (
		<main
			className="tutorial"
			style={
				{
					'--tutorial-code-background': preview.background,
					'--tutorial-code-foreground': preview.foreground,
				} as React.CSSProperties
			}
		>
			{children}
		</main>
	);
}

function applyPageMetadata(
	metadata: ReturnType<typeof getTutorialMetadata> | null
) {
	const selected = metadata ?? {
		title: 'Tutorial not found | PHP Playground',
		description: 'This tutorial page is unavailable.',
		imageUrl: getHomeMetadata().imageUrl,
		imageAlt: getHomeMetadata().imageAlt,
	};
	document.title = selected.title;
	const meta = (
		attribute: 'name' | 'property',
		key: string,
		content: string
	) => {
		const nodes = Array.from(
			document.head.querySelectorAll<HTMLMetaElement>(
				`meta[${attribute}="${key}"]`
			)
		);
		const node = nodes.shift() ?? document.createElement('meta');
		nodes.forEach((duplicate) => duplicate.remove());
		node.setAttribute(attribute, key);
		node.content = content;
		document.head.appendChild(node);
	};
	meta('name', 'description', selected.description);
	meta('property', 'og:title', selected.title);
	meta('property', 'og:description', selected.description);
	meta('property', 'og:image', selected.imageUrl);
	meta('property', 'og:image:alt', selected.imageAlt);
	meta('name', 'twitter:image', selected.imageUrl);
	meta('name', 'twitter:image:alt', selected.imageAlt);
	const canonicalNodes = Array.from(
		document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]')
	);
	const canonical = canonicalNodes.shift() ?? document.createElement('link');
	canonicalNodes.forEach((duplicate) => duplicate.remove());
	if (metadata) {
		canonical.rel = 'canonical';
		canonical.href = metadata.canonicalUrl;
		document.head.appendChild(canonical);
		meta('property', 'og:url', metadata.canonicalUrl);
		document.head
			.querySelectorAll('meta[name="robots"]')
			.forEach((node) => node.remove());
	} else {
		canonical.remove();
		document.head
			.querySelectorAll('meta[property="og:url"]')
			.forEach((node) => node.remove());
		meta('name', 'robots', 'noindex');
	}
}

function usePageMetadata(
	metadata: ReturnType<typeof getTutorialMetadata> | null
) {
	const title = metadata?.title;
	const description = metadata?.description;
	const canonicalUrl = metadata?.canonicalUrl;
	React.useEffect(() => {
		applyPageMetadata(metadata);
		return () => applyPageMetadata(getHomeMetadata());
	}, [title, description, canonicalUrl]);
}

export default function TutorialPage() {
	const { version, slug, '*': unmatched } = useParams();
	const validVersion = version && isTutorialVersion(version) ? version : null;
	const requestedLesson = validVersion
		? lessonsByVersion[validVersion].find((item) => item.slug === slug)
		: undefined;
	usePageMetadata(
		validVersion && !unmatched && (!slug || requestedLesson)
			? getTutorialMetadata(validVersion, requestedLesson)
			: null
	);

	if (unmatched)
		return (
			<TutorialSurface>
				<h1>Lesson not found</h1>
				<Link to="/tutorial/">Browse the tutorial</Link>
			</TutorialSurface>
		);
	if (!version || version === 'latest') {
		const destination =
			slug &&
			lessonsByVersion[latestTutorialVersion].some(
				(lesson) => lesson.slug === slug
			)
				? `${slug}/`
				: '';
		return (
			<Navigate
				replace
				to={`/tutorial/${latestTutorialVersion}/${destination}`}
			/>
		);
	}
	if (!isTutorialVersion(version))
		return (
			<TutorialSurface>
				<h1>No lessons for this version yet</h1>
				<Link to="/tutorial/">Browse the tutorial</Link>
			</TutorialSurface>
		);
	return <VersionPage version={version} slug={slug} />;
}

function VersionPage(props: { version: TutorialVersion; slug?: string }) {
	const errors = validateLessons(lessonsByVersion[props.version]);
	if (errors.length)
		return (
			<TutorialSurface>
				<h1>Invalid tutorial content</h1>
				<ul role="alert">
					{errors.map((error, index) => (
						<li key={index}>{error}</li>
					))}
				</ul>
			</TutorialSurface>
		);
	return <ValidVersionPage {...props} />;
}

function ValidVersionPage({
	version,
	slug,
}: {
	version: TutorialVersion;
	slug?: string;
}) {
	const navigate = useNavigate();
	const groups = groupLessons(lessonsByVersion[version]);
	const lessons = groups.flatMap((chapter) => chapter.lessons);
	const lesson = lessons.find((item) => item.slug === slug);

	function switchVersion(next: string) {
		if (!isTutorialVersion(next)) return;
		const destination =
			slug && lessonsByVersion[next].some((item) => item.slug === slug)
				? `${slug}/`
				: '';
		navigate(`/tutorial/${next}/${destination}`);
	}
	return (
		<TutorialSurface>
			<header className="tutorial-header">
				<div className="tutorial-top">
					<Link className="tutorial-site-brand" to="/">
						PHP Playground
					</Link>
					<div className="tutorial-header-controls">
						<label className="tutorial-version-control">
							Learn with{' '}
							<Select
								size="sm"
								width="auto"
								value={version}
								onChange={(event) =>
									switchVersion(event.target.value)
								}
							>
								{[...tutorialVersions].reverse().map((item) => (
									<option key={item} value={item}>
										PHP {item}
									</option>
								))}
							</Select>
						</label>
						<ThemeToggle />
					</div>
				</div>
				<nav aria-label="Breadcrumb">
					<ol className="tutorial-breadcrumbs">
						<li>
							<Link to="/tutorial/">Tutorial</Link>
						</li>
						<li>
							{lesson ? (
								<Link to={`/tutorial/${version}/`}>
									PHP {version}
								</Link>
							) : (
								<span aria-current="page">PHP {version}</span>
							)}
						</li>
						{lesson && (
							<li>
								<Link
									to={`/tutorial/${version}/#chapter-${lesson.chapterId}`}
								>
									{
										chapters.find(
											(chapter) =>
												chapter.id === lesson.chapterId
										)!.title
									}
								</Link>
							</li>
						)}
						{lesson && <li aria-current="page">{lesson.title}</li>}
					</ol>
				</nav>
			</header>
			{slug && !lesson ? (
				<section>
					<h1>Lesson not found</h1>
					<Link to={`/tutorial/${version}/`}>
						PHP {version} lesson index
					</Link>
				</section>
			) : lesson ? (
				<LessonPage
					key={`${version}/${lesson.slug}`}
					version={version}
					lesson={lesson}
					lessons={lessons}
				/>
			) : (
				<>
					<header className="tutorial-intro">
						<p className="tutorial-eyebrow">
							PHP {version} · LEARN IN YOUR BROWSER
						</p>
						<h1>Learn PHP, one experiment at a time.</h1>
						<p>
							Start with a small program. Change the code and see
							what happens, right beside the explanation. No
							installation needed.
						</p>
						<Button
							as={Link}
							size="sm"
							colorScheme="green"
							to={`/tutorial/${version}/${lessons[0].slug}/`}
						>
							Start learning →
						</Button>
					</header>
					<section aria-labelledby="lesson-list">
						<h2 id="lesson-list">Your learning path</h2>
						{groups.map((chapter) => (
							<section
								className="tutorial-chapter"
								id={`chapter-${chapter.id}`}
								key={chapter.id}
							>
								<div className="tutorial-chapter-heading">
									<h3>{chapter.title}</h3>
								</div>
								<ol className="tutorial-lessons">
									{chapter.lessons.map((item) => (
										<li key={item.slug}>
											<Link
												to={`/tutorial/${version}/${item.slug}/`}
											>
												<span className="tutorial-number">
													{String(
														lessons.indexOf(item) +
															1
													).padStart(2, '0')}
												</span>
												<span>
													<strong>
														{item.title}
													</strong>
													<span className="tutorial-summary">
														{item.summary}
													</span>
												</span>
												<span aria-hidden="true">
													→
												</span>
											</Link>
										</li>
									))}
								</ol>
							</section>
						))}
					</section>
				</>
			)}
		</TutorialSurface>
	);
}

function LessonPage({
	version,
	lesson,
	lessons,
}: {
	version: TutorialVersion;
	lesson: Lesson;
	lessons: readonly Lesson[];
}) {
	const storagePrefix = `php-tutorial:${version}:${lesson.slug}`;
	const drafts = React.useRef<Record<string, string>>({});
	function variantKey(id: string | null) {
		return id === null ? 'sample' : `experiment:${id}`;
	}
	function variantProgram(id: string | null) {
		const programId =
			id === null
				? lesson.sampleProgramId
				: lesson.experiments.find((experiment) => experiment.id === id)!
						.programId;
		return lesson.programs[programId];
	}
	function readDraft(id: string | null) {
		const key = variantKey(id);
		if (drafts.current[key] !== undefined) return drafts.current[key];
		try {
			return (
				localStorage.getItem(`${storagePrefix}:${key}:draft`) ??
				(id === null
					? localStorage.getItem(`${storagePrefix}:draft`)
					: null) ??
				variantProgram(id).code
			);
		} catch {
			return variantProgram(id).code;
		}
	}
	const [active, setActive] = React.useState<{
		id: string | null;
		code: string;
	}>(() => ({ id: null, code: readDraft(null) }));
	const { code } = active;
	const program = variantProgram(active.id);
	function setCode(nextCode: string) {
		setActive((previous) => ({ ...previous, code: nextCode }));
	}
	const [saveError, setSaveError] = React.useState(false);
	const [contentsOpen, setContentsOpen] = React.useState(
		() => window.matchMedia('(min-width: 1200px)').matches
	);
	const runner = useTutorialRunner(version);
	React.useEffect(() => {
		try {
			drafts.current[variantKey(active.id)] = code;
			localStorage.setItem(
				`${storagePrefix}:${variantKey(active.id)}:draft`,
				code
			);
			setSaveError(false);
		} catch {
			setSaveError(true);
		}
	}, [code, storagePrefix, active.id]);
	function selectExperiment(id: string | null) {
		drafts.current[variantKey(active.id)] = code;
		const nextCode = readDraft(id);
		runner.reset();
		setActive({ id, code: nextCode });
	}
	const index = lessons.findIndex((item) => item.slug === lesson.slug);
	const next = lessons[index + 1];
	const previous = lessons[index - 1];
	const runInput = program.input;
	const inputJSON = JSON.stringify(runInput ?? null);
	const phpInputLiteral = inputJSON
		.replace(/\\/g, '\\\\')
		.replace(/'/g, "\\'");
	const playgroundCode =
		runInput !== undefined
			? `<?php\n$input = json_decode('${phpInputLiteral}', true);\n?>${code}`
			: code;
	const playgroundURL =
		'/?' +
		new URLSearchParams({
			v: version,
			c: compressToEncodedURIComponent(playgroundCode),
			f: 'console',
		});
	return (
		<>
			<div className="tutorial-lesson-layout">
				<details
					className="tutorial-syllabus"
					open={contentsOpen}
					onToggle={(event) =>
						setContentsOpen(event.currentTarget.open)
					}
				>
					<summary>Course contents</summary>
					<nav aria-label="Course contents">
						{groupLessons(lessons).map((chapter) => (
							<div
								className="tutorial-syllabus-chapter"
								key={chapter.id}
							>
								<h3>{chapter.title}</h3>
								<ol>
									{chapter.lessons.map((item) => (
										<li key={item.slug}>
											<Link
												to={`/tutorial/${version}/${item.slug}/`}
												aria-current={
													item.slug === lesson.slug
														? 'page'
														: undefined
												}
											>
												<span>
													{String(
														lessons.indexOf(item) +
															1
													).padStart(2, '0')}
												</span>
												{item.title}
											</Link>
										</li>
									))}
								</ol>
							</div>
						))}
					</nav>
				</details>
				<header className="tutorial-lesson-heading">
					<p className="tutorial-eyebrow">
						LESSON {String(index + 1).padStart(2, '0')} /{' '}
						{lessons.length} · PHP {version}
					</p>
					<h1>{lesson.title}</h1>
					<p>{lesson.goal}</p>
				</header>
				<div className="tutorial-workspace">
					<article className="tutorial-explanation">
						<LessonSections
							lesson={lesson}
							version={version}
							activeExperimentId={active.id}
							onSelectExperiment={selectExperiment}
						/>
						<section>
							<h2>Explore the official manual</h2>
							<ul>
								{lesson.references.map((reference) => (
									<li key={reference.url}>
										<a
											href={reference.url}
											target="_blank"
											rel="noreferrer"
										>
											{reference.title} ↗
										</a>
									</li>
								))}
							</ul>
						</section>
					</article>
					<aside className="tutorial-lab" aria-label="Try PHP">
						<div className="tutorial-lab-title">
							<label htmlFor="tutorial-code">Edit code</label>
							<span>
								PHP {version} ·{' '}
								{active.id === null
									? 'Example'
									: lesson.experiments.find(
											(experiment) =>
												experiment.id === active.id
										)!.title}
							</span>
						</div>
						<textarea
							id="tutorial-code"
							spellCheck={false}
							value={code}
							onChange={(event) => setCode(event.target.value)}
							aria-describedby="draft-status"
						/>
						{runInput !== undefined && runInput !== null && (
							<details className="tutorial-run-input">
								<summary>Run input</summary>
								<pre>{JSON.stringify(runInput, null, 2)}</pre>
							</details>
						)}

						<div className="tutorial-actions">
							<Button
								size="sm"
								colorScheme="green"
								onClick={() => runner.run(code, runInput)}
								isDisabled={runner.running}
							>
								{runner.running ? 'Running…' : 'Run'}
							</Button>
							{runner.running && (
								<Button size="sm" onClick={runner.stop}>
									Stop
								</Button>
							)}
							<Button
								size="sm"
								onClick={() => {
									runner.reset();
									setCode(program.code);
								}}
							>
								Reset
							</Button>
							<a
								href={playgroundURL}
								target="_blank"
								rel="noreferrer"
							>
								Open in Playground ↗
							</a>
						</div>
						<p id="draft-status" className="tutorial-note">
							{saveError
								? 'This browser cannot save your edits.'
								: 'Your edits are saved in this browser.'}
						</p>
						<div
							data-testid="tutorial-output"
							className="tutorial-result"
							aria-live="polite"
							aria-busy={runner.running}
						>
							<h2>Output</h2>
							{runner.error ? (
								<p role="alert">{runner.error}</p>
							) : (
								<pre>
									{runner.running
										? 'Running PHP…'
										: runner.code === null
											? 'Press Run to see your output here.'
											: runner.output || '(No output)'}
								</pre>
							)}
							{runner.code !== null &&
								runner.code !== code &&
								!runner.running && (
									<p className="tutorial-note">
										Your code has changed. Run it again to
										see the new result.
									</p>
								)}
						</div>
					</aside>
				</div>
			</div>
			<nav className="tutorial-pagination" aria-label="Lesson navigation">
				{previous ? (
					<Link to={`/tutorial/${version}/${previous.slug}/`}>
						← {previous.title}
					</Link>
				) : (
					<Link to={`/tutorial/${version}/`}>← All lessons</Link>
				)}
				{next && (
					<Link to={`/tutorial/${version}/${next.slug}/`}>
						{next.title} →
					</Link>
				)}
			</nav>
		</>
	);
}
