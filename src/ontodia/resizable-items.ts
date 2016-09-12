import * as $ from 'jquery';

export function resizeItem(this: HTMLElement) {
    var self = $(this), // current item
        header = self.find('.filter-item__header'), // header
        handle = self.find('.filter-item__handle'), // handler
        closed = false; // flag

        // close item
        header.click(function () {

            // find neighbor and total height
            var total,
                neighbor = self.nextAll('.filter-item').not(".closed").first();

            if (!neighbor.length) {
                neighbor = self.prevAll('.filter-item').not(".closed").first();
            }

            if (neighbor.length) {
                total = self.outerHeight() + neighbor.outerHeight();
            }
            else {
                total = self.outerHeight();
            }

            var panelHeight = self.parent().height(); // parnet height
            var headerHeight = header.outerHeight(); // header height

            var leftP, rightP;

            if (closed) { // if closed, open and distribute height between element and neighbor
                self.removeClass('closed');

                if (neighbor.length) { // if neighbor, open and set height 50х50
                    leftP = 0.5;
                    rightP = 1 - leftP;

                    self.animate({
                        'height': (leftP * (total / panelHeight)) * 100 + '%'
                    }, 300);
                    neighbor.animate({
                        'height': (rightP * (total / panelHeight)) * 100 + '%'
                    }, 300);
                }
                else { // if not neighbor, set max height
                    var neighborsArr = self.siblings('.filter-item');
                    var neighborsHeight = 0;

                    for(var i = 0; i < neighborsArr.length; i++) {
                        neighborsHeight += $(neighborsArr[i]).outerHeight();
                    }

                    self.animate({
                        'height': ((panelHeight - neighborsHeight) / panelHeight) * 100 + '%'
                    }, 300);
                }

                closed = false;
            }
            else {
                // if opened, set minimum height and rest add neighbor
                self.addClass('closed');

                leftP = headerHeight / total;
                rightP = 1 - leftP;

                self.animate({
                    'height': (leftP * (total / panelHeight)) * 100 + '%'
                }, 300);
                neighbor.animate({
                    'height': (rightP * (total / panelHeight)) * 100 + '%'
                }, 300);

                closed = true;
            }
        });

        // resize item
        return handle.css('cursor', "ns-resize").on("mousedown", function (e) {
            var body = $('body');

            var priorCursor = body.css('cursor');
            body.css('cursor', "ns-resize");

            var zIndex = handle.css('z-index'),
                handleHeight = handle.outerHeight(),
                posY = handle.offset().top + handleHeight - e.pageY;

            handle.css('z-index', 1000).parents().on("mousemove", function (e) {

                // find neighbor and total height
                var neighbor = self.nextAll('.filter-item').not(".closed").first();

                if(!neighbor.length) {
                    return;
                }

                var total = self.outerHeight() + neighbor.outerHeight();
                var panelHeight = self.parent().height();

                // calculate ratio of the current element and its neighbor
                var leftPercentage = (((e.pageY - self.offset().top) + (posY - handleHeight / 2)) / total);
                var rightPercentage = 1 - leftPercentage;

                if ((leftPercentage * (total / panelHeight)) <= (header.outerHeight() / panelHeight)
                    || (rightPercentage * (total / panelHeight)) <= (neighbor.find('.filter-item__header').outerHeight() / panelHeight)) {
                    return;
                }

                // set height
                self.css('height', (leftPercentage * (total / panelHeight)) * 100 + '%');
                neighbor.css('height', (rightPercentage * (total / panelHeight)) * 100 + '%');

                $(document).on("mouseup", function () {
                    body.css('cursor', priorCursor);
                    handle.css('z-index', zIndex);
                    handle.parents().off("mousemove");
                });
            });
            e.preventDefault();
        });
}
