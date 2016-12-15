import * as Backbone from 'backbone';
import * as _ from 'lodash';

import { Dictionary, ElementModel } from '../data/model';
import { FilterParams } from '../data/provider';

import { Element, FatLinkType } from '../diagram/elements';
import {
    DiagramModel, normalizeTemplate, chooseLocalizedText,
} from '../diagram/model';

/**
 * Properties:
 *     type: string - one of [typeId, text, linkedElementId, linkedToByLinkType]
 *     typeId: string
 *     text: string
 *     elementId: string
 *     linkTypeId: string
 */
export class FilterCriterion extends Backbone.Model {
    static instanceOf(typeId: string): FilterCriterion {
        return new FilterCriterion({type: 'typeId', typeId: typeId});
    }
    static containsText(text: string): FilterCriterion {
        return new FilterCriterion({type: 'text', text: text});
    }
    static connectedTo(elementId: string): FilterCriterion {
        return new FilterCriterion({type: 'linkedElementId', elementId: elementId});
    }
    static connectedToByLinkType(elementId: string, linkTypeId: string): FilterCriterion {
        return new FilterCriterion({type: 'linkedToByLinkType', elementId: elementId, linkTypeId: linkTypeId});
    }
}

/**
 * Model of filter component.
 *
 * Properties:
 *     language: string - language code (e.g. 'en', 'ru', ...)
 *     moreItemsAvailable: boolean
 *
 * Events:
 *     state:beginQuery
 *     state:endQuery
 *     state:queryError
 */
export class FilterModel extends Backbone.Model {
    criteria = new Backbone.Collection<FilterCriterion>([]);
    items = new Backbone.Collection<Element>([]);

    private currentRequest: FilterParams;

    constructor(public diagram: DiagramModel) {
        super();
        this.listenTo(this.criteria, 'add remove reset change', () => this.queryItems());
        this.listenTo(this, 'change:language', () => this.queryItems());
        this.listenTo(this.diagram.graph, 'add-to-filter', (element: Element, linkType?: FatLinkType) => {
            if (linkType) {
                this.filterByLinkedElementAndLinkType(element.id, linkType.id);
            } else {
                this.filterByLinkedElement(element.id);
            }
        });
    }

    public filterByType(typeId: string) {
        this.criteria.reset([FilterCriterion.instanceOf(typeId)]);
    }

    public filterByLinkedElement(elementId: string) {
        this.criteria.reset([FilterCriterion.connectedTo(elementId)]);
    }

    public filterByLinkedElementAndLinkType(elementId: string, linkTypeId: string) {
        this.criteria.reset([FilterCriterion.connectedToByLinkType(elementId, linkTypeId)]);
    }

    private createRequest(): FilterParams {
        const language: string = this.get('language');
        const request: FilterParams = {
            offset: 0, limit: 100,
            languageCode: language ? language : 'en',
        };
        this.criteria.each((criterion: FilterCriterion) => {
            const type = criterion.get('type');
            if (type === 'typeId') {
                request.elementTypeId = criterion.get('typeId');
            } else if (type === 'text') {
                request.text = criterion.get('text');
            } else if (type === 'linkedElementId') {
                request.refElementId = criterion.get('elementId');
            } else if (type === 'linkedToByLinkType') {
                request.refElementId = criterion.get('elementId');
                request.refElementLinkId = criterion.get('linkTypeId');
            }
        });
        return request;
    }

    public queryItems(loadMoreItems = false) {
        this.trigger('state:beginQuery');
        if (this.criteria.length === 0) {
            this.items.reset([]);
            this.currentRequest = null;
            this.set('moreItemsAvailable', false);
            this.trigger('state:endQuery');
        } else {
            let request: FilterParams;
            if (loadMoreItems) {
                if (!this.currentRequest) {
                    throw new Error('Cannot request more items without initial request.');
                }
                request = _.assign({}, this.currentRequest, {
                    offset: this.currentRequest.offset + this.currentRequest.limit,
                }) as FilterParams;
            } else {
                request = this.createRequest();
            }
            this.currentRequest = request;
            this.diagram.dataProvider.filter(request).then(elements => {
                if (this.currentRequest !== request) { return; }
                this.processFilterData(elements);
            }).catch(error => {
                if (this.currentRequest !== request) { return; }
                console.error(error);
                this.trigger('state:queryError');
            });
        }
    }

    private processFilterData(elements: Dictionary<ElementModel>) {
        let newItems: Element[] = [];
        for (const elementId in elements) {
            if (elements.hasOwnProperty(elementId)) {
                let element = this.diagram.elements[elementId];
                if (!element) {
                    element = new Element({id: elementId});
                    element.template = normalizeTemplate(elements[elementId]);
                }
                newItems.push(element);
                element.unset('selectedInFilter');
            }
        }

        if (this.currentRequest.offset > 0) {
            this.items.add(newItems);
        } else {
            this.items.reset(newItems);
        }

        this.set('moreItemsAvailable', newItems.length >= this.currentRequest.limit);
        this.trigger('state:endQuery');
    }
}

export default FilterModel;
