import test from 'node:test';
import assert from 'node:assert/strict';
import { placeNameFromReverse } from '../../netlify/functions/travel-places.mjs';

const feature = (properties) => ({ properties });

test('place name from coordinates: the street, never the business standing on it', () => {
  const name = placeNameFromReverse([
    feature({ name: 'Restaurante Inventado', osm_key: 'amenity', osm_value: 'restaurant', type: 'house', street: 'Rua do Exemplo', city: 'Lisboa' })
  ]);
  assert.equal(name, 'Rua do Exemplo');
});

test('place name from coordinates: a street result uses its own name', () => {
  assert.equal(placeNameFromReverse([feature({ name: 'Travessa Inventada', osm_key: 'highway', type: 'street', city: 'Porto' })]), 'Travessa Inventada');
});

test('place name from coordinates: with no street, the neighbourhood and its town', () => {
  assert.equal(
    placeNameFromReverse([feature({ name: 'Miradouro Inventado', osm_key: 'tourism', type: 'house', district: 'Ribeira', city: 'Porto' })]),
    'Ribeira, Porto'
  );
  assert.equal(placeNameFromReverse([feature({ name: 'Foz', type: 'district', city: 'Porto' })]), 'Foz, Porto');
});

test('place name from coordinates: a later result with a street beats an earlier one without', () => {
  assert.equal(
    placeNameFromReverse([feature({ name: 'Museu Inventado', osm_key: 'tourism', type: 'house', city: 'Lisboa' }), feature({ street: 'Largo da Amostra' })]),
    'Largo da Amostra'
  );
});

test('place name from coordinates: only a town, or nothing at all', () => {
  assert.equal(placeNameFromReverse([feature({ name: 'Farol Inventado', osm_key: 'man_made', type: 'house', city: 'Aveiro' })]), 'Aveiro');
  assert.equal(placeNameFromReverse([feature({ name: 'Baleal Surf Shop', osm_key: 'shop', type: 'house' })]), null);
  assert.equal(placeNameFromReverse([]), null);
  assert.equal(placeNameFromReverse(undefined), null);
});
