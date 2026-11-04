import * as React from 'react';
import './advertisement.css';

const client = 'ca-pub-7840166449982456';

type AdParameters = {
	slot: string;
	layout?: 'in-article';
	format?: 'fluid';
};

type AdWindow = Window & {
	adsbygoogle?: { push: (request: Record<string, never>) => unknown };
};

function AdSenseUnit({ slot, layout, format }: AdParameters) {
	const element = React.useRef<HTMLModElement>(null);
	React.useEffect(() => {
		const node = element.current;
		if (!node) return;
		// Wait until the slot has a usable width; never request the same DOM slot twice.
		const observer = new ResizeObserver(() => {
			if (node.getBoundingClientRect().width < 250) return;
			observer.disconnect();
			if (node.dataset.adRequested) return;
			node.dataset.adRequested = 'true';
			if (!document.querySelector('script[data-adsense-loader]')) {
				const script = document.createElement('script');
				script.async = true;
				script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
				script.crossOrigin = 'anonymous';
				script.dataset.adsenseLoader = 'true';
				document.head.appendChild(script);
			}
			try {
				const adWindow = window as AdWindow;
				(adWindow.adsbygoogle =
					adWindow.adsbygoogle ||
					new Array<Record<string, never>>()).push({});
			} catch (error) {
				console.warn(
					'AdSense could not initialize the advertisement.',
					error
				);
			}
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	return (
		<ins
			ref={element}
			className="adsbygoogle"
			style={{ display: 'block', textAlign: 'center' }}
			data-ad-client={client}
			data-ad-slot={slot}
			data-ad-layout={layout}
			data-ad-format={format}
		/>
	);
}

export function Advertisement({
	slot,
	layout,
	format,
	className,
	children,
}: AdParameters & { className: string; children: React.ReactNode }) {
	return (
		<aside
			className={`advertisement ${className}`}
			aria-label="Advertisement"
		>
			<div className="advertisement-label">Advertisement</div>
			{import.meta.env.PROD ? (
				<AdSenseUnit slot={slot} layout={layout} format={format} />
			) : (
				<div className="advertisement-placeholder">{children}</div>
			)}
		</aside>
	);
}
