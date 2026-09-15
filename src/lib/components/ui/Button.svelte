<script lang="ts">
	import { Button, type ButtonRootProps } from 'bits-ui';

	type Props = ButtonRootProps;

	let { href, children, class: className, ...rest }: Props = $props();
</script>

<Button.Root
	{href}
	{...rest as Record<string, unknown>}
	class={`button u:fs-1${className ? ` ${className}` : ''}`}
>
	{@render children?.()}
</Button.Root>

<style>
	@layer default {
		:global(.button) {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: var(--space-xs);
			font-family: var(--ff-ui);
			font-weight: 600;
			line-height: 1;
			background-color: var(--hue-blue-500);
			color: white;
			padding: var(--space-sm) var(--space-lg);
			border: 0;
			border-radius: var(--radius-md);
			/*
			 * `--space-*` is fluid and shrinks as the viewport narrows, so
			 * padding alone makes this button smallest on the screen where a
			 * finger needs it largest. The floor is not negotiable per-screen.
			 */
			min-block-size: var(--tap-min);
			cursor: pointer;
			text-decoration: none;
			transition:
				background-color 0.15s ease,
				color 0.15s ease,
				transform 0.05s ease;
		}

		:global(.button:not([href]):hover:not(:disabled):not([aria-disabled='true'])) {
			background-color: var(--hue-blue-600);
		}

		:global(.button:not([href]):active:not(:disabled):not([aria-disabled='true'])) {
			transform: scale(0.98);
		}

		:global(.button[href]) {
			background-color: transparent;
			color: var(--hue-blue-500);
			/* A link is text in a sentence, not a control, so the floor is off. */
			min-block-size: 0;
			padding-inline: 0;
			text-decoration: underline;
			text-decoration-thickness: from-font;
			text-underline-offset: 0.2em;
		}

		:global(.button[href]:hover:not(:disabled):not([aria-disabled='true'])) {
			color: var(--hue-blue-600);
		}

		:global(.button:disabled),
		:global(.button[aria-disabled='true']) {
			opacity: 0.5;
			cursor: not-allowed;
		}
	}
</style>
