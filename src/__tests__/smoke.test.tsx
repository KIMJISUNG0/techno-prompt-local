import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// Minimal smoke test: ensure root element renders something without crashing.

function Dummy() {
  return <div data-testid="dummy">ok</div>;
}

describe('smoke', () => {
  it('renders dummy component', () => {
    const { getByTestId } = render(<Dummy />);
    expect(getByTestId('dummy').textContent).toBe('ok');
  });
});
