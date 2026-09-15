import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SignIn from './SignIn.svelte';

describe('SignIn', () => {
	it('hands the handle to the caller on submit', async () => {
		const onSignIn = vi.fn();
		const screen = render(SignIn, { onSignIn });

		await screen.getByLabelText('Handle').fill('alice.bsky.social');
		await screen.getByRole('button', { name: 'Sign in with Bluesky' }).click();

		expect(onSignIn).toHaveBeenCalledWith('alice.bsky.social');
	});

	it('asks for nothing but a handle', async () => {
		// The point of OAuth here: the user authenticates on their own server,
		// and this app never has a credential to mishandle.
		const screen = render(SignIn, { onSignIn: vi.fn() });

		await expect.element(screen.getByLabelText('Handle')).toBeInTheDocument();
		expect(document.querySelectorAll('input[type="password"]')).toHaveLength(0);
	});

	it('says what the app will be allowed to do before sending anyone to consent', async () => {
		const screen = render(SignIn, { onSignIn: vi.fn() });

		await expect.element(screen.getByText(/add and remove follows/i)).toBeInTheDocument();
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
