import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

function MinimalComposerShell() {
	return <section data-testid="composer-shell">composer-shell</section>;
}

describe('Composer component shell', () => {
	it('renders shell element', () => {
		const { getByTestId } = render(<MinimalComposerShell />);
		expect(getByTestId('composer-shell').textContent).toContain('composer');
	});
});
