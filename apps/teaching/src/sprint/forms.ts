import { PHASE_FORMS, FORM_SIGNATURES, CARDS } from './player';
import { mountUnderstand, understandSignature } from './phase-understand';
import { mountSketch, sketchSignature } from './phase-sketch';
import { mountDecide, decideSignature } from './phase-decide';
import { mountPrototype, prototypeSignature } from './phase-prototype';
import { mountTest, mountFeedbackCard, testSignature } from './phase-test';

/** Registers each phase's form, and the pitch feedback card, with the player. */
PHASE_FORMS.understand = mountUnderstand;
FORM_SIGNATURES.understand = understandSignature;
PHASE_FORMS.sketch = mountSketch;
FORM_SIGNATURES.sketch = sketchSignature;
PHASE_FORMS.decide = mountDecide;
FORM_SIGNATURES.decide = decideSignature;
PHASE_FORMS.prototype = mountPrototype;
FORM_SIGNATURES.prototype = prototypeSignature;
PHASE_FORMS.test = mountTest;
FORM_SIGNATURES.test = testSignature;
CARDS.feedback = mountFeedbackCard;
