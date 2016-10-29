import * as $ from 'jquery';

export function resizePanel(this: HTMLElement) {
        const self = $(this),
            handle = self.find('.filter-panel__handle'),
            item = self.find('.filter-item'),
            parentHeight = $(this).parent().height(),
            btn = self.find('.filter-panel__handle-btn');
        let flagClosed = false;

        const min = 0, // minimum width
            max = 30; // maximum width

        // Set initial height
        self.height(parentHeight);
        item.css('height', 100 / item.length + '%');

        // Close Panel
        btn.click(function () {
            if (flagClosed) {
                self.css({'width': 15 + '%'});
                btn.removeClass('active');
                flagClosed = false;
            } else {
                self.css({'width': 0 + '%'});
                btn.addClass('active');
                flagClosed = true;
            }

            $(window).trigger('resize-panel');
            return false;
        });

        // Resize panel
        return handle.css('cursor', 'ew-resize').on('mousedown', function (e) {
            if (!btn.is(e.target)) {
                const body = $('body');

                const priorCursor = body.css('cursor');
                body.css('cursor', 'ew-resize');

                const zIndex = handle.css('z-index'),
                    handleWidth = handle.outerWidth(),
                    posX = handle.offset().left + handleWidth - e.pageX;

                handle.css('z-index', 1000).parents().on('mousemove', function (e) {
                    if (flagClosed) {
                        flagClosed = false;
                        btn.removeClass('active');
                    }

                    const panelWidth = self.parent().width();
                    const width = self.outerWidth();

                    let percentage = 0;
                    if (self.hasClass('ontodia-left-panel')) {
                        percentage = ((e.pageX - self.offset().left) + (posX - handleWidth / 2));
                    } else if (self.hasClass('ontodia-right-panel')) {
                        percentage = width - ((e.pageX - self.offset().left) + (posX - handleWidth / 2));
                    }

                    const w = (percentage / panelWidth) * 100;
                    if (w <= min || w >= max) {
                        return;
                    }

                    self.css('width', w + '%');

                    $(window).trigger('resize-panel');

                    $(document).on('mouseup', function () {
                        body.css('cursor', priorCursor);
                        handle.css('z-index', zIndex);
                        handle.parents().off('mousemove');
                    });
                });
            }

            e.preventDefault();
        });
}

export function setPanelHeight(this: HTMLElement) {
    const parentHeight = $(this).parent().height();
    $(this).height(parentHeight);
}
