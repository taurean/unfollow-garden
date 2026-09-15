import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SignIn from './SignIn.svelte';

/** The one stable name for the field, whatever the visible label is doing. */
const FIELD = 'Your username on any atproto service';

describe('SignIn', () => {
	it('hands the handle to the caller on submit', async () => {
		const onSignIn = vi.fn();
		const screen = render(SignIn, { onSignIn });

		await screen.getByLabelText(FIELD).fill('alice.bsky.social');
		await screen.getByRole('button', { name: 'Verify identity' }).click();

		expect(onSignIn).toHaveBeenCalledWith('alice.bsky.social');
	});

	it('asks for nothing but a username', async () => {
		// The point of OAuth here: the user authenticates on their own server,
		// and this app never has a credential to mishandle.
		render(SignIn, { onSignIn: vi.fn() });

		expect(document.querySelectorAll('input[type="password"]')).toHaveLength(0);
	});

	it('keeps the field’s accessible name stable while the visible label cycles', async () => {
		// The label rotates through service names so no one operator looks like
		// the requirement. Rotating the accessible name too would make a screen
		// reader re-announce the field every few seconds.
		const screen = render(SignIn, { onSignIn: vi.fn() });

		await expect.element(screen.getByLabelText(FIELD)).toBeInTheDocument();
		expect(FIELD).not.toMatch(/bluesky|blacksky|eurosky/i);
	});

	it('names more than one service, so none reads as the requirement', async () => {
		const screen = render(SignIn, { onSignIn: vi.fn() });

		await expect.element(screen.getByText(/Blacksky/)).toBeInTheDocument();
		await expect.element(screen.getByText(/host yourself/)).toBeInTheDocument();
	});

	it('says what the app will be allowed to do before sending anyone to consent', async () => {
		const screen = render(SignIn, { onSignIn: vi.fn() });

		await expect.element(screen.getByText(/add and\s+remove follows/)).toBeInTheDocument();
	});

	it('shows the reason a sign-in failed', async () => {
		const screen = render(SignIn, {
			onSignIn: vi.fn(),
			error: 'Authorization was denied'
		});

		await expect.element(screen.getByRole('alert')).toHaveTextContent('Authorization was denied');
	});

	it('cannot be submitted twice while a redirect is already running', async () => {
		const screen = render(SignIn, { onSignIn: vi.fn(), busy: true });

		await expect.element(screen.getByRole('button', { name: 'Redirecting…' })).toBeDisabled();
	});
});
