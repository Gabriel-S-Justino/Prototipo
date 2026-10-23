import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NASA_MODEL_MANIFEST, getOfficialModel, validateModelManifest } from '../js/data/nasa-resources.js';
import { ROCKET_PARTS } from '../js/data/parts.js';

test('manifesto NASA só contém ativos com proveniência explícita', () => {
  assert.deepEqual(validateModelManifest(), []);
  const rover = getOfficialModel('perseverance-rover');
  assert.equal(rover.official, true);
  assert.equal(rover.assetType, 'rover');
  assert.match(rover.source, /^https:\/\//);
});

test('IDs desconhecidos não recebem modelo oficial por inferência', () => {
  assert.equal(getOfficialModel('engine-main'), null);
  assert.equal(getOfficialModel('tank-l'), null);
});

test('peças do foguete identificam explicitamente o visual como procedural', () => {
  assert.ok(ROCKET_PARTS.length > 0);
  for (const part of ROCKET_PARTS) {
    assert.equal(part.visualSource, 'procedural-illustration', part.id);
    assert.equal(part.officialModelId, null, part.id);
  }
});

test('validador rejeita manifesto sem fonte verificável', () => {
  const errors = validateModelManifest({ bad: { id: 'bad', url: 'http://example.com/a.glb', source: '', official: false } });
  assert.ok(errors.length >= 4);
});
