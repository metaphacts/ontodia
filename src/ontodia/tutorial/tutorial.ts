import * as $ from 'jquery';
import { introJs } from 'intro.js';

const helpAlreadySeenKey = 'helpPopupDisable';

export function showTutorial() {
    let $additionalOverlay: JQuery = null,
        $overlayImage: JQuery = null;
    introJs()
        .setOption('showStepNumbers', false)
        .onafterchange(function (element) {
            if (!$additionalOverlay) {
                $additionalOverlay = $('<div class="intro-additional-overlay"></div>')
                    .css('display', 'none')
                    .appendTo(document.body);
                $overlayImage = $('<img/>').appendTo($additionalOverlay);
            }

            const $element = $(element);
            const offset = $element.offset(),
                width  = $element.width(),
                height = $element.height(),
                introStepId = $element.attr('data-intro-id');

            if (introStepId === 'class-tree') {
                $overlayImage.attr('src', require<string>('../../../images/tutorial/step1.png'))
                    .css({width: 'auto', height: '100%'});
                $additionalOverlay.css({
                    left: offset.left + width + 50,
                    top: offset.top + height * 0.7 - 80,
                    width: 'auto',
                    height: height * 0.6,
                }).show();
            } else if (introStepId === 'filter-view') {
                $overlayImage.attr('src', require<string>('../../../images/tutorial/step2.png'))
                    .css({width: '100%', height: 'auto'});
                $additionalOverlay.css({
                    left: offset.left,
                    top: offset.top + height * 0.2,
                    width: width * 2,
                    height: 'auto',
                }).show();
            } else if (introStepId === 'diagram-area') {
                $overlayImage.attr('src', require<string>('../../../images/tutorial/step3.png'))
                    .css({width: 'auto', height: '100%'});
                $additionalOverlay.css({
                    left: offset.left,
                    top: offset.top + height * 0.2,
                    width: 'auto',
                    height: height * 0.8,
                }).show();
            } else if (introStepId === 'resize') {
                $overlayImage.attr('src', require<string>('../../../images/tutorial/step7.png')).css({
                    width: '240px',
                    height: 'auto',
                    position: 'absolute',
                    right: 0,
                    top: '50%',
                    margin: '-70px -37px 0 0',
                });

                $additionalOverlay.css({
                    left: offset.left,
                    top: offset.top,
                    width: width + 8,
                    height: height,
                    background: 'rgba(255, 255, 255, 0.55)',
                }).show();
            } else {
                $additionalOverlay.hide();
            }
        }).onexit(function () {
            $additionalOverlay.remove();
            localStorage.setItem(helpAlreadySeenKey, 'true');
        }).oncomplete(function () {
            $additionalOverlay.remove();
            localStorage.setItem(helpAlreadySeenKey, 'true');
        }).start();
}

export function showTutorialIfNotSeen() {
    if (!localStorage.getItem(helpAlreadySeenKey)) {
        showTutorial();
    }
}
