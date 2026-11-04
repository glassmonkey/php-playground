import * as React from 'react';
import { Advertisement } from './advertisement';

// AdSense requires in-page size rules for customized responsive display units.
// https://support.google.com/adsense/answer/9183363
export function PlaygroundHeaderAd() {
	return (
		<>
			<style>{`
.advertisement--banner .adsbygoogle { width:320px; max-width:100%; height:50px; }
@media(min-width:1200px) {
 .advertisement--banner .adsbygoogle { width:728px; height:90px; }
}
`}</style>
			<Advertisement slot="1212533878" className="advertisement--banner">
				<span className="advertisement-desktop-size">728 × 90</span>
				<span className="advertisement-mobile-size">320 × 50</span>
			</Advertisement>
		</>
	);
}

export function TutorialIndexAd() {
	return (
		<>
			<style>{`
.advertisement--index .adsbygoogle { width:300px; max-width:100%; height:250px; }
`}</style>
			<Advertisement slot="8899452200" className="advertisement--index">
				<span>300 × 250</span>
			</Advertisement>
		</>
	);
}

export function TutorialLessonHeaderAd() {
	return (
		<>
			<style>{`
.advertisement--lesson-banner .adsbygoogle { width:320px; height:100px; }
@media(min-width:1200px) {
 .advertisement--lesson-banner .adsbygoogle { width:468px; height:60px; }
}
@media(min-width:1440px) {
 .advertisement--lesson-banner .adsbygoogle { width:728px; height:90px; }
}
`}</style>
			<Advertisement
				slot="9386537367"
				className="advertisement--lesson-banner"
			>
				<span className="advertisement-lesson-small-size">
					320 × 100
				</span>
				<span className="advertisement-lesson-medium-size">
					468 × 60
				</span>
				<span className="advertisement-lesson-large-size">
					728 × 90
				</span>
			</Advertisement>
		</>
	);
}

export function TutorialArticleAd() {
	return (
		<Advertisement
			slot="6923813529"
			className="advertisement--article"
			layout="in-article"
			format="fluid"
		>
			<span>In-article ad · responsive height</span>
		</Advertisement>
	);
}
