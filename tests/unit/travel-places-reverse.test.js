import test from 'node:test';
import assert from 'node:assert/strict';
import { placeAddressFromReverse, placeNameFromReverse } from '../../netlify/functions/travel-places.mjs';

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

test('address from coordinates: street, neighbourhood, postcode, town and country', () => {
  const address = placeAddressFromReverse([
    feature({
      name: 'Restaurante Inventado',
      osm_key: 'amenity',
      type: 'house',
      housenumber: '12',
      street: 'Rua do Exemplo',
      district: 'Alfama',
      postcode: '1100-000',
      city: 'Lisboa',
      country: 'Portugal'
    })
  ]);
  assert.deepEqual(address, {
    street: 'Rua do Exemplo',
    district: 'Alfama',
    postcode: '1100-000',
    city: 'Lisboa',
    country: 'Portugal'
  });
});

test('address from coordinates: never a house number, never a business name', () => {
  const address = placeAddressFromReverse([
    feature({ name: 'Baleal Surf Shop', osm_key: 'shop', type: 'house', housenumber: '7', city: 'Peniche', country: 'Portugal' })
  ]);
  assert.deepEqual(address, { city: 'Peniche', country: 'Portugal' });
  assert.equal(JSON.stringify(address).includes('7'), false);
  assert.equal(JSON.stringify(address).includes('Surf'), false);
});

test('address from coordinates: a street result uses its own name, and later results fill the gaps', () => {
  const address = placeAddressFromReverse([
    feature({ name: 'Travessa Inventada', osm_key: 'highway', type: 'street' }),
    feature({ name: 'Museu Inventado', osm_key: 'tourism', type: 'house', city: 'Porto', country: 'Portugal' })
  ]);
  assert.deepEqual(address, { street: 'Travessa Inventada', city: 'Porto', country: 'Portugal' });
});

test('address from coordinates: a neighbourhood named like its town is left out, and nothing gives null', () => {
  assert.deepEqual(placeAddressFromReverse([feature({ district: 'Porto', city: 'Porto', country: 'Portugal' })]), {
    city: 'Porto',
    country: 'Portugal'
  });
  assert.deepEqual(placeAddressFromReverse([feature({ name: 'Foz', type: 'district', city: 'Porto' })]), {
    district: 'Foz',
    city: 'Porto'
  });
  assert.equal(placeAddressFromReverse([]), null);
  assert.equal(placeAddressFromReverse(undefined), null);
});
