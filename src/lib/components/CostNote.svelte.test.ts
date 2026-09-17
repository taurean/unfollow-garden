import { describe, expect, it, vi } from 'vitest';
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

	it('opens the breakdown from the figure, so the number can be taken apart', async () => {
		// A claim about someone else's prices should hand a reader its own
		// arithmetic before it hands them the source.
		const onexplain = vi.fn();
		const screen = render(CostNote, {
			props: { counts: { ...NOTHING, profiles: 100 }, onexplain }
		});

		await screen.getByRole('button', { name: '$1.00' }).click();

		expect(onexplain).toHaveBeenCalledOnce();
	});

	it('states the figure without offering a breakdown when there is nowhere to go', async () => {
		const screen = render(CostNote, { props: { counts: { ...NOTHING, profiles: 100 } } });

		expect({
			text: screen.container.textContent?.includes('$1.00'),
			button: screen.container.querySelector('button')
		}).toEqual({ text: true, button: null });
	});

	it('credits xbill, which is where the comparison comes from', async () => {
		const screen = render(CostNote, { props: { counts: { ...NOTHING, profiles: 100 } } });

		await expect.element(screen.getByRole('link', { name: 'xbill' })).toBeVisible();
	});

	it('says the figure is the cost of loading this person’s own data', async () => {
		// Not the cost of running the project: the number is what one review of
		// one follow list would have cost, and the sentence has to say so.
		const screen = render(CostNote, { props: { counts: { ...NOTHING, profiles: 100 } } });

		expect(screen.container.textContent).toContain('loading your data would have cost');
	});

	it('says the AT Protocol side was free, which is the whole point', async () => {
		const screen = render(CostNote, { props: { counts: { ...NOTHING, profiles: 100 } } });

		expect(screen.container.textContent).toContain('because of AT Protocol it was free');
	});
});
