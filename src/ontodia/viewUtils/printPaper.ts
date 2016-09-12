import * as _ from 'lodash';
import * as $ from 'jquery';
import * as joint from 'jointjs';
import { V, g } from 'jointjs';

export interface PrintPaperOptions {
    size?: string;
    paddingLeft?: number;
    paddingRight?: number;
    paddingTop?: number;
    paddingBottom?: number;
    padding?: number;
    detachBody?: boolean;
    beforePrint?: () => void;
    afterPrint?: () => void;
    printFinished?: () => void;
}

function beforePrint(opt: PrintPaperOptions, data) {
    var svg = V(this.svg);
    var paddingLeft = opt.paddingLeft || opt.padding;
    var paddingRight = opt.paddingRight || opt.padding;
    var paddingTop = opt.paddingTop || opt.padding;
    var paddingBottom = opt.paddingBottom || opt.padding;
    var bbox = this.getContentBBox().moveAndExpand({x: -paddingLeft, y: -paddingTop, width: paddingLeft + paddingRight, height: paddingTop + paddingBottom});
    data.attrs = {width: svg.attr("width"), height: svg.attr("height"), viewBox: svg.attr("viewBox")};
    data.scrollLeft = this.el.scrollLeft;
    data.scrollTop = this.el.scrollTop;
    svg.attr({width: "100%", height: "100%", viewBox: [bbox.x, bbox.y, bbox.width, bbox.height].join(" ")});
    this.$el.addClass("printarea").addClass(opt.size);
    if (opt.detachBody) {
        data.$parent = this.$el.parent();
        data.index = data.$parent.children().index(this.$el);
        data.$content = $(document.body).children().detach();
        this.$el.appendTo(document.body)
    }
    if (opt.beforePrint) { opt.beforePrint(); }
}

function afterPrint(opt: PrintPaperOptions, data) {
    if (opt.afterPrint) { opt.afterPrint(); }
    var svg = V(this.svg);
    var isWebkit = !!window['chrome'] && !window['opera'];
    var isFirefox = navigator.userAgent.toLowerCase().indexOf("firefox") > -1;
    if ((isWebkit || isFirefox) && !data.attrs.viewBox) {
        svg.node.removeAttributeNS(null, "viewBox");
        delete data.attrs.viewBox
    }
    svg.attr(data.attrs);
    this.$el.removeClass("printarea").removeClass(opt.size);
    if (opt.detachBody) {
        if (data.$parent.children().length) {
            data.$parent.children().eq(data.index).before(this.$el)
        } else {
            this.$el.appendTo(data.$parent)
        }
        data.$content.appendTo(document.body)
    }
    this.el.scrollLeft = data.scrollLeft;
    this.el.scrollTop = data.scrollTop
    if (opt.printFinished) { opt.printFinished(); }
}

export function printPaper(paper: joint.dia.Paper, opt?: PrintPaperOptions) {
    opt = opt || {};
    _.defaults(opt, {size: "a4", padding: 5, detachBody: true});
    var data = {};
    type Handler = (e?: JQueryEventObject) => void;
    var localBeforePrint = _.bind<Function, Handler>(beforePrint, paper, opt, data);
    var localAfterPrint = _.bind<Function, Handler>(afterPrint, paper, opt, data);
    var printEvents = "onbeforeprint" in window;
    if (printEvents) {
        $(window).one("beforeprint", localBeforePrint);
        $(window).one("afterprint", localAfterPrint);
    } else {
        localBeforePrint();
    }
    window.print();
    if (!printEvents) {
        var onceAfterPrint = _.once(localAfterPrint);
        $(document).one("mouseover", onceAfterPrint);
        _.delay(onceAfterPrint, 1000);
    }
}

export default printPaper;
