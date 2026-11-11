import { registerPlayer, registerPrint } from '../../solo/registry';
import { mountWhoSaidIt } from './player';
import { renderWhoSaidItPrint } from './print';
import './who-said-it.css';

registerPlayer('who_said_it', { mount: mountWhoSaidIt });
registerPrint('who_said_it', renderWhoSaidItPrint);
