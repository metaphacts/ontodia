import * as Backbone from 'backbone';
import * as _ from 'lodash';
import * as $ from 'jquery';
import * as joint from 'jointjs';
import { V, g } from 'jointjs';

export interface PaperAreaOptions {
    paper: joint.dia.Paper;
    padding?: number;
    autoResizePaper?: boolean;
}

export interface PaperAreaZoomOptions {
    absolute?: boolean;
    grid?: number;
    min?: number;
    max?: number;
    ox?: number;
    oy?: number;
}

export class PaperArea extends Backbone.View<any> {
    private options: PaperAreaOptions;
    private padding: {
        paddingLeft: number;
        paddingTop: number;
    }
    private $svg: JQuery;
    private _sx: number;
    private _sy: number;
    private _baseWidth: number;
    private _baseHeight: number;
    private _center: g.point;
    
    private isPanning = false;
    private originX: number;
    private originY: number;
    private originScrollLeft: number;
    private originScrollTop: number;
    
    constructor(options: PaperAreaOptions) {
        super(_.defaults(options || {}, {
            className: "paper-area",
            padding: 0,
            autoResizePaper: false
        }, options));
    }
    initialize(options?: PaperAreaOptions) {
        _.bindAll(this, "startPanning", "stopPanning", "pointermove");
        this.delegateEvents(this.events = <any>{
            mousedown: "pointerdown",
            mousewheel: "mousewheel", DOMMouseScroll: "mousewheel"
        });
        this.options = options;
        var paper = this.options.paper;
        var initScale = V(paper.viewport).scale();
        this._sx = initScale.sx;
        this._sy = initScale.sy;
        this._baseWidth = paper.options.width;
        this._baseHeight = paper.options.height;
        
        this.$svg = $(this.options.paper.svg);
        this.$svg.css({ overflow: 'visible' });
        this.$el.css({ height: '100%' });
        this.$el.append(paper.el);
        this.addPadding();
        
        this.listenTo(paper, "scale", this.onScale);
        this.listenTo(paper, "resize", this.onResize);
        if (this.options.autoResizePaper) {
            this.listenTo(paper.model, "change add remove reset", this.adjustPaper);
        }
        $(document).on("mousemove.panning touchmove.panning", this.pointermove);
        $(document.body).on("mouseup.stopPanning touchend.stopPanning", this.stopPanning);
    }
    private onResize() {
        if (this._center) { this.center(this._center.x, this._center.y); }
    }
    private onScale(sx: number, sy: number, ox?: number, oy?: number) {
        this._sx = sx;
        this._sy = sy;
        this.adjustPaper();
        if (ox || oy) { this.center(ox, oy); }
    }
    public toLocalPoint(x, y) {
        var ctm = this.options.paper.viewport.getCTM();
        x += this.el.scrollLeft - this.padding.paddingLeft - ctm.e;
        x /= ctm.a;
        y += this.el.scrollTop - this.padding.paddingTop - ctm.f;
        y /= ctm.d;
        return g.point(x, y);
    }
    public adjustPaper() {
        this._center = this.toLocalPoint(this.el.clientWidth / 2, this.el.clientHeight / 2);
        this.options.paper.fitToContent({gridWidth: this._baseWidth * this._sx, gridHeight: this._baseHeight * this._sy, allowNewOrigin: "negative"});
        return this;
    }
    public center(x?: number, y?: number) {
        var ctm = this.options.paper.viewport.getCTM();
        var x1 = -ctm.e;
        var y1 = -ctm.f;
        var x2 = x1 + this.options.paper.options.width;
        var y2 = y1 + this.options.paper.options.height;
        if (_.isUndefined(x) || _.isUndefined(y)) {
            x = (x1 + x2) / 2;
            y = (y1 + y2) / 2;
        } else {
            x *= ctm.a;
            y *= ctm.d;
        }
        var p = this.options.padding;
        var cx = this.el.clientWidth / 2;
        var cy = this.el.clientHeight / 2;
        this.addPadding();
        this.el.scrollLeft = x - cx + ctm.e + this.padding.paddingLeft;
        this.el.scrollTop = y - cy + ctm.f + this.padding.paddingTop;
        return this;
    }
    public centerContent() {
        var vbox = V(this.options.paper.viewport).bbox(true, this.options.paper.svg);
        this.center(vbox.x + vbox.width / 2, vbox.y + vbox.height / 2);
        return this;
    }
    public addPadding() {
        var scrollerWidth = this.el.clientWidth,
            scrollerHeight = this.el.clientHeight;
        var paperWidth = Number(this.$svg.attr("width")),
            paperHeight = Number(this.$svg.attr("height"));
        // initially set spacing to paperSize * 0.5
        // but make total spacing no less than (scrollerSize - paperSize)
        // overwise paper will not be centered when zoomed out at maximum
        var sw = paperWidth * 0.5,
            sh = paperHeight * 0.5;
        if (sw * 2 + paperWidth < scrollerWidth) {
            sw = (scrollerWidth - paperWidth) / 2;
        }
        if (sh * 2 + paperHeight < scrollerHeight) {
            sh = (scrollerHeight - paperHeight) / 2;
        }
        var base = this.options.padding;
        var padding = this.padding = {paddingLeft: Math.round(base + sw), paddingTop: Math.round(base + sh)};
        var margin = {marginBottom: Math.round(base + sh), marginRight: Math.round(base + sw)};
        padding.paddingLeft = Math.min(padding.paddingLeft, this.el.clientWidth * .9);
        padding.paddingTop = Math.min(padding.paddingTop, this.el.clientHeight * .9);
        this.$el.css(padding);
        this.options.paper.$el.css(margin);
        return this;
    }
    public zoom(value: number, opt?: PaperAreaZoomOptions) {
        opt = opt || {};
        var center = this.toLocalPoint(this.el.clientWidth / 2, this.el.clientHeight / 2);
        var sx = value;
        var sy = value;
        var ox;
        var oy;
        if (!opt.absolute) {
            sx += this._sx;
            sy += this._sy;
        }
        if (opt.grid) {
            sx = Math.round(sx / opt.grid) * opt.grid;
            sy = Math.round(sy / opt.grid) * opt.grid;
        }
        if (opt.max) {
            sx = Math.min(opt.max, sx);
            sy = Math.min(opt.max, sy);
        }
        if (opt.min) {
            sx = Math.max(opt.min, sx);
            sy = Math.max(opt.min, sy);
        }
        if (_.isUndefined(opt.ox) || _.isUndefined(opt.oy)) {
            ox = center.x;
            oy = center.y;
        } else {
            var fsx = sx / this._sx;
            var fsy = sy / this._sy;
            ox = opt.ox - (opt.ox - center.x) / fsx;
            oy = opt.oy - (opt.oy - center.y) / fsy;
        }
        this.options.paper.scale(sx, sy);
        this.center(ox, oy);
        return this;
    }
    public zoomToFit(opt?: joint.dia.PaperScaleToFitOptions) {
        opt = opt || {};
        var paper = this.options.paper;
        var paperOrigin = _.clone(paper.options.origin);
        opt.fittingBBox = opt.fittingBBox || _.extend({}, g.point(paperOrigin), {
            width: this.$el.width() + this.padding.paddingLeft,
            height: this.$el.height() + this.padding.paddingTop
        });
        paper.scaleContentToFit(opt);
        paper.setOrigin(paperOrigin.x, paperOrigin.y);
        this.adjustPaper().centerContent();
        return this;
    }
    private mousewheel(evt) {
        if (evt.ctrlKey) {
            evt.preventDefault();
            var delta = Math.max(-1, Math.min(1, evt.originalEvent.wheelDelta || -evt.originalEvent.detail));
            var offset = this.$el.offset();
            var o = this.toLocalPoint(
                evt.originalEvent.pageX - offset.left,
                evt.originalEvent.pageY - offset.top);
            this.zoom(delta / 10, {min: .2, max: 5, ox: o.x, oy: o.y});
            return false;
        }
    }
    public startPanning(evt) {
        this.originX = evt.pageX;
        this.originY = evt.pageY;
        this.originScrollLeft = this.el.scrollLeft;
        this.originScrollTop = this.el.scrollTop;
        this.isPanning = true;
    }
    private pan(evt: MouseEvent) {
        if (this.isPanning) {
            if (!isLeftButtonDown(evt)) {
                this.isPanning = false;
                return;
            }
            var offsetX = evt.pageX - this.originX,
                offsetY = evt.pageY - this.originY;
            this.el.scrollLeft = this.originScrollLeft - offsetX;
            this.el.scrollTop = this.originScrollTop - offsetY;
        }
    }
    private stopPanning() {
        this.isPanning = false;
    }
    private pointerdown(evt) {
        if (evt.target == this.el) {
            this.options.paper['pointerdown'].apply(this.options.paper, arguments);
        }
    }
    private pointermove(evt) {
        this.pan(evt);
        if (evt.target == this.el) {
            this.options.paper['pointermove'].apply(this.options.paper, arguments);
        }
    }
    public remove() {
        Backbone.View.prototype.remove.apply(this, arguments);
        $(document).off(".panning", this.pointermove);
        $(document.body).off(".stopPanning", this.stopPanning);
        return this;
    }
}

export default PaperArea;

function isLeftButtonDown(evt: MouseEvent) {
    return (evt.buttons & 1) !== 0;
}
