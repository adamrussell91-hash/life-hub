import { registerPrint } from '../../solo/registry';
import { renderWagerPrint } from './print';
import './live';

// Wager is live only (spec §6.8): no solo player. The room rules register in core/room-rules-index.ts.
registerPrint('wager', renderWagerPrint);
