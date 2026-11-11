import { registerPlayer, registerPrint } from '../../solo/registry';
import { mountFindAWord } from './player';
import { renderFindAWordPrint } from './print';
import './find-a-word.css';

registerPlayer('find_a_word', { mount: mountFindAWord });
registerPrint('find_a_word', renderFindAWordPrint);
