import { registerPrint } from '../../solo/registry';
import { renderJeopardyPrint } from './print';
import './live';

// Live only (no solo player): the board and phone views, and the print copy.
registerPrint('jeopardy', renderJeopardyPrint);
