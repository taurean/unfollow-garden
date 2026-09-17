import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CostNote from './CostNote.svelte';

const NOTHING = {
	ownerDid: 'did:plc:owner',
	follows: 0,
	profiles: 0,
	relationships: 0,
	posts: 0,
	likes: 0
};

describe('the cost note', () => {
	it('says nothing at all before anything has been fetched', () => {
		// A $0.00 counter in front of someone who has just signed in is noise.
		const screen = render(CostNote, { props: { counts: NOTHING } });

		expect(screen.container.textContent?.trim()).toBe('');
	});

	it('states the figure once the review has fetched something', async () => {
		const screen = render(CostNote, {
			props: { counts: { ...NOTHING, profiles: 1204, posts: 28400 } }
		});

		// 1204 profiles at $0.010 and 28,400 posts at $0.005.
		await expect.element(screen.getByText('$154.04')).toBeVisible();
	});

	it('links the figure to the rate card it came from', async () => {
		const screen = render(CostNote, { props: { counts: { ...NOTHING, profiles: 100 } } });

		expect(screen.container.querySelector('.figure')?.getAttribute('href')).toBe(
			'https://docs.x.com/x-api/getting-started/pricing'
		);
	});

	it('credits xbill, which is where the comparison comes from', async () => {
		const screen = render(CostNote, { props: { counts: { ...NOTHING, profiles: 100 } } });

		await expect.element(screen.getByRole('link', { name: 'xbill' })).toBeVisible();
	});

	it('says the AT Protocol side was free, which is the whole point', async () => {
		const screen = render(CostNote, { props: { counts: { ...NOTHING, profiles: 100 } } });

		expect(screen.container.textContent).toContain('On AT Protocol it was free');
	});
});
