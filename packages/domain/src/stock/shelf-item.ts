import { Effect, Schema, SchemaTransformation } from 'effect';

import { isRealIsoDate } from './calendar';
import { InvalidStock } from './errors';

const IsoDate = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/));

const ShelfDraft = Schema.Struct({
	name: Schema.String.pipe(Schema.decode(SchemaTransformation.trim())).check(
		Schema.isMinLength(1),
		Schema.isMaxLength(80),
	),
	category: Schema.Literals([
		'snack',
		'coffee',
		'tissue',
		'dairy',
		'fresh',
		'paper',
		'seasoning',
		'supply',
		'drink',
		'staple',
		'fruit',
		'frozen',
		'care',
	]),
	unit: Schema.Literals(['carton', 'slab', 'bag', 'roll', 'bottle', 'ream', 'can', 'piece']),
	quantity: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(999)),
	safetyQuantity: Schema.Int.check(
		Schema.isGreaterThanOrEqualTo(0),
		Schema.isLessThanOrEqualTo(999),
	),
	expiresOn: Schema.NullOr(IsoDate),
	shelf: Schema.Literals(['fridge', 'tearoom', 'washroom', 'sink', 'cupboard', 'printroom']),
});

export type ShelfItemDraft = typeof ShelfDraft.Type;

/** Validates a good before it is placed on a shelf. */
export const draftShelfItem = (input: unknown) =>
	Effect.gen(function* () {
		const drafted = yield* Schema.decodeUnknownEffect(ShelfDraft)(input).pipe(
			Effect.mapError((error) => new InvalidStock({ reason: error.message })),
		);
		if (drafted.expiresOn !== null && !isRealIsoDate(drafted.expiresOn)) {
			return yield* new InvalidStock({ reason: 'expiresOn is not a real date.' });
		}
		return drafted;
	});
