import * as Backbone from 'backbone';
import * as d3 from 'd3';
import * as _ from 'lodash';
import * as $ from 'jquery';

import { FilterCriterion, FilterModel } from './filterModel';
import { Element, Link, FatLinkType } from '../diagram/elements';
import { uri2name } from '../diagram/model';
import DiagramView from '../diagram/view';
import { CollectionView, removeAllViews } from '../viewUtils/collectionView';

export { FilterCriterion, FilterModel };

export interface BaseFilterOptions<TModel extends Backbone.Model> extends Backbone.ViewOptions<TModel> {
    view: DiagramView;
}

export interface FilterElementOptions<TModel extends Backbone.Model> extends BaseFilterOptions<TModel> {
    filterView: FilterView;
}

class FilterCriterionView extends Backbone.View<FilterCriterion> {
    view: DiagramView;

    constructor(options: FilterElementOptions<FilterCriterion>) {
        super(_.extend({tagName: 'li', className: 'criterion'}, options));
        this.view = options.view;
        this.listenTo(this.view, 'change:language', this.render);
    }

    public render(): FilterCriterionView {
        var getElementLabel = (elementId: string) => {
            var element = this.view.model.elements[elementId];
            var elementTemplate = element ? element.template : null;
            return elementTemplate ? this.view.getLocalizedText(elementTemplate.label.values).text : uri2name(elementId);
        }

        this.$el.empty();
        var $buttons = $("<div class='btn-group btn-group-xs'></div>").appendTo(this.$el);
        $("<button type='button' class='btn btn-default'><span class='glyphicon glyphicon-remove'/></button>")
            .on('click', () => { this.model.trigger('destroy', this.model); })
            .appendTo($buttons);
        var type: string = this.model.get('type');
        if (type === 'typeId') {
            var typeId = this.model.get('typeId');
            var classInfo = this.view.model.classesById[typeId];
            var classLabel = classInfo ? this.view.getLocalizedText(classInfo.label.values).text : uri2name(typeId);
            var span = $('<span>Has type </span>').appendTo(this.$el);
            $('<span class="class-label"></span>').text(classLabel).appendTo(span);
        } else if (type === 'linkedElementId') {
            var elementLabel = getElementLabel(this.model.get('elementId'));
            var span = $('<span>Connected to </span>').appendTo(this.$el);
            $('<span class="element-label"></span>').text(elementLabel).appendTo(span);
        } else if (type === 'linkedToByLinkType') {
            var elementLabel = getElementLabel(this.model.get('elementId'));
            var linkTypeId = this.model.get('linkTypeId');
            var linkType = this.view.model.getLinkType(linkTypeId);
            var linkTypeLabel = linkType ? this.view.getLocalizedText(linkType.get('label').values).text : uri2name(linkTypeId)
            var span = $('<span>Connected to </span>')
                .append($('<span class="element-label"></span>').text(elementLabel))
                .append(" through ")
                .append($('<span class="link-type-label"></span>').text(linkTypeLabel))
                .appendTo(this.$el);
        }
        return this;
    }
}

class FilterElementView extends Backbone.View<Element> {
    view: DiagramView;
    filterView: FilterView;
    private $div: JQuery;

    constructor(options: FilterElementOptions<Element>) {
        super(options);
        this.view = options.view;
        this.filterView = options.filterView;
        this.listenTo(this.model, 'change:presentOnDiagram change:selectedInFilter', this.updateView);
        this.listenTo(this.view, 'change:language', this.updateView);
        this.render();
    }

    public render(): FilterElementView {
        if (this.$div) { return this; }
        this.$el.empty().attr('draggable', 'true');
        this.$div = $("<div class='unselectable'/>").appendTo(this.$el);
        this.el.addEventListener('dragstart', (e) => {
            this.model.set('selectedInFilter', true);
            var selectedElements: Element[] = this.filterView.model.items.filter(item => item.get('selectedInFilter'));
            var elementIds = selectedElements.map(element => element.id as string);
            try {
                e.dataTransfer.setData('application/x-ontodia-elements', JSON.stringify(elementIds));
            } catch (ex) { // IE fix
                e.dataTransfer.setData('text', JSON.stringify(elementIds));
            }
            this.view.dragAndDropElements = _.keyBy(selectedElements, 'id');
            this.el.classList.add("dragging");
            return false;
        });
        this.el.addEventListener('dragend', (e) => {
            $(".elementInToolBox").removeClass("dragging");
        });
        this.el.addEventListener('click', (e) => {
            if (!this.model.get('presentOnDiagram')) {
                this.model.set('selectedInFilter', !this.model.get('selectedInFilter'));
            }
        });
        this.updateView();
        return this;
    }

    public updateView() {
        if (this.$div) {
            const template = this.model.template;
            this.$div.text(this.view.getLocalizedText(template.label.values).text);
            this.$el.attr('title', 'Classes: ' + this.view.getElementTypeString(template));
            this.$el.attr('data-presentOnDiagram', this.model.get('presentOnDiagram'));

            const {h, c, l} = this.view.getTypeStyle(template.types).color;
            const frontColor = this.model.get('selectedInFilter')
                ? d3.hcl(h, c, l * 1.2) : d3.hcl('white');
            this.$el.css({ background: d3.hcl(h, c, l) });
            this.$div.css({ background: frontColor });

            if (this.model.get('presentOnDiagram')) {
                this.$el.removeAttr('draggable');
            } else {
                this.$el.attr('draggable', 'true');
            }
        }
    }
}

export class FilterView extends Backbone.View<FilterModel> {
    private elementViews: CollectionView<Element>;
    private criteriaViews: FilterCriterionView[] = [];

    private $progress: JQuery;
    private $filterCriteria: JQuery;
    private $filterText: JQuery;
    private $loadMoreButton: JQuery;
    private isRendered = false;

    view: DiagramView;

    constructor(options: BaseFilterOptions<FilterModel>) {
        super(_.extend({className: 'filter-view stateBasedProgress'}, options));
        this.$el.addClass(_.result(this, 'className') as string);
        this.view = options.view;
        var childOptions: FilterElementOptions<Element> = {
            tagName: 'li',
            view: this.view,
            filterView: this
        };
        this.elementViews = new CollectionView<Element>({
            collection: this.model.items,
            childView: FilterElementView,
            childOptions: childOptions,
            tagName: 'ul',
            className: 'filtered-items'
        });
        this.listenTo(this.model.criteria, 'add remove reset', this.onCriteriaChanged);
        this.listenTo(this.model, 'state:beginQuery', () => {
            this.$el.attr('data-state', "querying");
        });
        this.listenTo(this.model, 'state:endQuery',   () => {
            if (this.model.criteria.length == 0) {
                this.$el.removeAttr('data-state');
            } else {
                this.$el.attr('data-state', "finished");
            }
            this.updateLoadMoreButtonState();
        });
        this.listenTo(this.model, 'state:queryError', () => this.$el.attr('data-state', "error"));
        this.listenTo(this.view, 'change:language', this.onLanguageChanged);
        this.model.set('language', this.view.getLanguage(), {silent: true});
    }

    private onLanguageChanged() {
        this.model.set('language', this.view.getLanguage());
    }

    private onCriteriaChanged() {
        if (this.isRendered) { this.renderCriteria(); }
    }

    private updateLoadMoreButtonState() {
        if (this.isRendered) {
            var itemsAvailable = this.model.get('moreItemsAvailable');
            if (this.model.items.length > 0) {
                this.$loadMoreButton.toggle(true);
                this.$loadMoreButton.prop("disabled", !itemsAvailable);
            } else {
                this.$loadMoreButton.toggle(itemsAvailable);
                this.$loadMoreButton.prop("disabled", false);
            }
        }
    }

    public render(): FilterView {
        this.isRendered = true;

        this.$progress = $('<div class="progress" style=""/>').appendTo(this.$el);
        $('<div/>').attr({
            'class': "progress-bar progress-bar-striped active",
            role: "progressbar",
            'aria-valuemin': "0",
            'aria-valuemax': "100",
            'aria-valuenow': "100",
            style: "width: 100%;"
        }).appendTo(this.$progress);

        var criteriaElement = $("<div class='filter-criteria'/>").appendTo(this.$el);
        this.$filterCriteria = $("<ul/>");

        this.$filterText = $("<input type='text' class='form-control' placeholder='Search for...'/>");
        var $filterTextGroup = $("<div class='input-group'/>")
            .append(this.$filterText)
            .append("<span class='input-group-btn'>" +
                "<button class='btn btn-default' type='button'>" +
                "<span class='glyphicon glyphicon-search'/></button></span>");

        var updateFilterText = () => { this.setFilterText(this.$filterText.val()) };
        $filterTextGroup.find("button").on('click', updateFilterText);
        this.$filterText.on('keydown', (e: JQueryEventObject) => {
            if (e.keyCode == 13) {
                updateFilterText();
            }
        });

        criteriaElement.append(this.$filterCriteria);
        criteriaElement.append($filterTextGroup);
        this.renderCriteria();

        var $scrollableRest = $("<div class='filter-rest'/>").appendTo(this.$el);
        this.elementViews.render();
        $scrollableRest.append(this.elementViews.el);

        this.$loadMoreButton = $(
                "<button type='button' class='btn btn-primary' style='display: none'>" +
                "<span class='glyphicon glyphicon-chevron-down'/>&nbsp;Show more</button>")
            .on('click', () => {
                this.$loadMoreButton.prop("disabled", true);
                this.model.queryItems(true);
            }).appendTo($("<div/>").appendTo($scrollableRest));
        return this;
    }

    private setFilterText(text: string) {
        var textCriterion = this.model.criteria.findWhere({type: 'text'});
        if (text.length == 0 && textCriterion) {
            this.model.criteria.remove(textCriterion);
        } else if (text.length > 0 && !textCriterion) {
            this.model.criteria.add(FilterCriterion.containsText(text));
        } else if (text.length > 0 && textCriterion) {
            textCriterion.set('text', text);
        }
    }

    private renderCriteria() {
        removeAllViews(this.criteriaViews);
        this.$filterText.val("");

        this.model.criteria.each(criterion => {
            if (criterion.get('type') == 'text') { this.$filterText.val(criterion.get('text')); }
            else {
                var criterionView = new FilterCriterionView({
                    model: criterion,
                    view: this.view,
                    filterView: this
                }).render();
                this.$filterCriteria.append(criterionView.el);
                this.criteriaViews.push(criterionView);
            }
        });
    }
}

export default FilterView;
