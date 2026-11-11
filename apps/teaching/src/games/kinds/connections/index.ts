import { registerPlayer, registerPrint } from '../../solo/registry';
import { mountConnections } from './player';
import { renderConnectionsPrint } from './print';
import './connections.css';

registerPlayer('connections', { mount: mountConnections });
registerPrint('connections', renderConnectionsPrint);
