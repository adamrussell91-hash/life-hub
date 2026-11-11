import { registerPlayer, registerPrint } from '../../solo/registry';
import { mountCrossword } from './player';
import { renderCrosswordPrint } from './print';
import './crossword.css';

registerPlayer('crossword', { mount: mountCrossword });
registerPrint('crossword', renderCrosswordPrint);
