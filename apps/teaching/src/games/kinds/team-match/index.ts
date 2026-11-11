import { registerPrint } from '../../solo/registry';
import { renderTeamMatchPrint } from './print';
import './live';

// Live only (no solo player): the board and phone views, and a matching sheet for paper.
registerPrint('team_match', renderTeamMatchPrint);
