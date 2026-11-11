import { registerPlayer } from '../../solo/registry';
import { mountPointsRush } from './player';
import './live';

// Points rush plays solo (homework) and live (spec §6.6). The room rules register in core/room-rules-index.ts.
registerPlayer('points_rush', { mount: mountPointsRush });
