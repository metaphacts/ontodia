import * as $ from 'jquery';
import { introJs } from 'intro.js';

export interface TutorialProps {
    'data-position': string;
    'data-step': string;
    'data-intro-id': string;
    'data-intro': string;
}

const helpAlreadySeenKey = 'helpPopupDisable';

export function showTutorial() {
    introJs()
        .setOption('showStepNumbers', false)
        .onexit(() => {
            localStorage.setItem(helpAlreadySeenKey, 'true');
        }).oncomplete(() => {
            localStorage.setItem(helpAlreadySeenKey, 'true');
        }).start();
}

export function showTutorialIfNotSeen() {
    if (!localStorage.getItem(helpAlreadySeenKey)) {
        showTutorial();
    }
}
