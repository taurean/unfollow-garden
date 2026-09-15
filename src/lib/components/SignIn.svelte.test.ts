import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SignIn from './SignIn.svelte';

describe('SignIn', () => {
	it('hands the handle and app password to the caller on submit', async () => {
		const onSignIn = vi.fn();
		const screen = render(SignIn, { onSignIn });

		await screen.getByLabelText('Handle').fill('alice.bsky.social');
		await screen.getByLabelText('App password').fill('xxxx-xxxx-xxxx-xxxx');
		await screen.getByRole('button', { name: 'Sign in' }).click();

		expect(onSignIn).toHaveBeenCalledWith('alice.bsky.social', 'xxxx-xxxx-xxxx-xxxx');
	});

	it('masks the app password so it is not readable on screen', async () => {
		const screen = render(SignIn, { onSignIn: vi.fn() });

		await expect.element(screen.getByLabelText('App password')).toHaveAttribute('type', 'password');
	});

	it('shows the reason a sign-in failed', async () => {
		const screen = render(SignIn, {
			onSignIn: vi.fn(),
			error: 'Invalid identifier or password'
		});

		await expect
			.element(screen.getByRole('alert'))
			.toHaveTextContent('Invalid identifier or password');
	});

	it('cannot be submitted twice while a sign-in is already running', async () => {
		const screen = render(SignIn, { onSignIn: vi.fn(), busy: true });

		await expect.element(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
	});
});
