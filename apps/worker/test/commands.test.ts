import { describe, it, expect } from 'vitest';
import { maskCustomApi } from '../src/lib/mask-custom-api';

describe('maskCustomApi', () => {
  it('collapses urlfetch/customapi calls, hiding the URL', () => {
    expect(maskCustomApi('$(urlfetch https://api.example.com/hug?key=SECRET)')).toBe('$(customapi)');
    expect(maskCustomApi('$(customapi https://api.example.com/x)')).toBe('$(customapi)');
    expect(maskCustomApi('Hug: $(urlfetch https://api.example.com/hug?to=$(touser))')).toBe('Hug: $(customapi)');
  });

  it('leaves everything else untouched', () => {
    expect(maskCustomApi('$(sender) rolls $(random.1-100)')).toBe('$(sender) rolls $(random.1-100)');
    expect(maskCustomApi('')).toBe('');
  });
});
