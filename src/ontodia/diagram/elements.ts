import {
    ClassModel, ElementModel, LinkModel, LocalizedString, Property,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri,
} from '../data/model';
import { GenerateID } from '../data/schema';

import { EventSource, Events, PropertyChange } from '../viewUtils/events';

import { Vector, Size, isPolylineEqual } from './geometry';

export type Cell = Element | Link | LinkVertex;

export interface ElementEvents {
    changeData: PropertyChange<Element, ElementModel>;
    changePosition: PropertyChange<Element, Vector>;
    changeSize: PropertyChange<Element, Size>;
    changeExpanded: PropertyChange<Element, boolean>;
    changeGroup: PropertyChange<Element, string>;
    requestedFocus: { source: Element };
    requestedGroupContent: { source: Element };
    requestedAddToFilter: {
        source: Element;
        linkType?: FatLinkType;
        direction?: 'in' | 'out';
    };
    requestedRedraw: { source: Element };
}

export class Element {
    private readonly source = new EventSource<ElementEvents>();
    readonly events: Events<ElementEvents> = this.source;

    readonly id: string;
    /** All in and out links of the element */
    readonly links: Link[] = [];

    private _data: ElementModel;
    private _position: Vector;
    private _size: Size;
    private _expanded: boolean;
    private _group: string | undefined;
    private _temporary: boolean;

    constructor(props: {
        id: string;
        data: ElementModel;
        position?: Vector;
        size?: Size;
        expanded?: boolean;
        group?: string;
        temporary?: boolean;
    }) {
        const {
            id,
            data,
            position = {x: 0, y: 0},
            size = {width: 0, height: 0},
            expanded = false,
            group,
            temporary = false,
        } = props;

        this.id = id;
        this._data = data;
        this._position = position;
        this._size = size;
        this._expanded = expanded;
        this._group = group;
        this._temporary = temporary;
    }

    get iri() { return this._data.id; }

    get data() { return this._data; }
    setData(value: ElementModel) {
        const previous = this._data;
        if (previous === value) { return; }
        this._data = value;
        this.source.trigger('changeData', {source: this, previous});
    }

    get position(): Vector { return this._position; }
    setPosition(value: Vector) {
        const previous = this._position;
        const same = (
            previous.x === value.x &&
            previous.y === value.y
        );
        if (same) { return; }
        this._position = value;
        this.source.trigger('changePosition', {source: this, previous});
    }

    get size(): Size { return this._size; }
    setSize(value: Size) {
        const previous = this._size;
        const same = (
            previous.width === value.width &&
            previous.height === value.height
        );
        if (same) { return; }
        this._size = value;
        this.source.trigger('changeSize', {source: this, previous});
    }

    get isExpanded(): boolean { return this._expanded; }
    setExpanded(value: boolean) {
        const previous = this._expanded;
        if (previous === value) { return; }
        this._expanded = value;
        this.source.trigger('changeExpanded', {source: this, previous});
    }

    get group(): string | undefined { return this._group; }
    setGroup(value: string | undefined) {
        const previous = this._group;
        if (previous === value) { return; }
        this._group = value;
        this.source.trigger('changeGroup', {source: this, previous});
    }

    get temporary(): boolean { return this._temporary; }

    focus() {
        this.source.trigger('requestedFocus', {source: this});
    }

    requestGroupContent() {
        this.source.trigger('requestedGroupContent', {source: this});
    }

    addToFilter(linkType?: FatLinkType, direction?: 'in' | 'out') {
        this.source.trigger('requestedAddToFilter', {
            source: this, linkType, direction,
        });
    }

    redraw() {
        this.source.trigger('requestedRedraw', {source: this});
    }
}

export interface AddToFilterRequest {
    element: Element;
    linkType?: FatLinkType;
    direction?: 'in' | 'out';
}

export interface FatClassModelEvents {
    changeLabel: PropertyChange<FatClassModel, ReadonlyArray<LocalizedString>>;
    changeCount: PropertyChange<FatClassModel, number | undefined>;
}

export class FatClassModel {
    private readonly source = new EventSource<FatClassModelEvents>();
    readonly events: Events<FatClassModelEvents> = this.source;

    readonly id: ElementTypeIri;

    private _base: FatClassModel | undefined;
    private _derived: FatClassModel[] = [];

    private _label: ReadonlyArray<LocalizedString>;
    private _count: number | undefined;

    constructor(props: {
        id: ElementTypeIri;
        label?: ReadonlyArray<LocalizedString>;
        count?: number;
    }) {
        const {id, label = [], count} = props;
        this.id = id;
        this._label = label;
        this._count = count;
    }

    get base() { return this._base; }
    get derived(): ReadonlyArray<FatClassModel> { return this._derived; }
    setBase(value: FatClassModel | undefined) {
        if (this._base === value) { return; }
        if (this._base) {
            this._base.removeDerived(this);
            this._base = undefined;
        }
        if (value) {
            this._base = value;
            this._base.addDerived(this);
        }
    }

    private addDerived(child: FatClassModel) {
        this._derived.push(child);
    }

    private removeDerived(child: FatClassModel) {
        const index = this._derived.indexOf(child);
        if (index >= 0) {
            this._derived.splice(index, 1);
        }
    }

    get label() { return this._label; }
    setLabel(value: ReadonlyArray<LocalizedString>) {
        const previous = this._label;
        if (previous === value) { return; }
        this._label = value;
        this.source.trigger('changeLabel', {source: this, previous});
    }

    get count() { return this._count; }
    setCount(value: number | undefined) {
        const previous = this._count;
        if (previous === value) { return; }
        this._count = value;
        this.source.trigger('changeCount', {source: this, previous});
    }
}

export interface RichPropertyEvents {
    changeLabel: PropertyChange<RichProperty, ReadonlyArray<LocalizedString>>;
}

export class RichProperty {
    private readonly source = new EventSource<RichPropertyEvents>();
    readonly events: Events<RichPropertyEvents> = this.source;

    readonly id: PropertyTypeIri;

    private _label: ReadonlyArray<LocalizedString>;

    constructor(props: {
        id: PropertyTypeIri;
        label?: ReadonlyArray<LocalizedString>;
    }) {
        const {id, label = []} = props;
        this.id = id;
        this._label = label;
    }

    get label(): ReadonlyArray<LocalizedString> { return this._label; }
    setLabel(value: ReadonlyArray<LocalizedString>) {
        const previous = this._label;
        if (previous === value) { return; }
        this._label = value;
        this.source.trigger('changeLabel', {source: this, previous});
    }
}

export interface LinkEvents {
    changeData: PropertyChange<Link, LinkModel>;
    changeLayoutOnly: PropertyChange<Link, boolean>;
    changeVertices: PropertyChange<Link, ReadonlyArray<Vector>>;
}

export class Link {
    private readonly source = new EventSource<LinkEvents>();
    readonly events: Events<LinkEvents> = this.source;

    readonly id: string;

    private _typeId: LinkTypeIri;
    private _sourceId: string;
    private _targetId: string;

    private _data: LinkModel | undefined;
    private _layoutOnly: boolean;
    private _vertices: ReadonlyArray<Vector>;

    constructor(props: {
        id?: string;
        typeId: LinkTypeIri;
        sourceId: string;
        targetId: string;
        data?: LinkModel;
        vertices?: ReadonlyArray<Vector>;
    }) {
        const {id = GenerateID.forLink(), typeId, sourceId, targetId, data, vertices = []} = props;
        this.id = id;
        this._typeId = typeId;
        this._sourceId = sourceId;
        this._targetId = targetId;
        this._data = data;
        this._vertices = vertices;
    }

    get typeId() { return this._typeId; }
    get sourceId(): string { return this._sourceId; }
    get targetId(): string { return this._targetId; }

    get data() { return this._data; }
    setData(value: LinkModel | undefined) {
        const previous = this._data;
        if (previous === value) { return; }
        this._data = value;
        this._typeId = value.linkTypeId;
        this.source.trigger('changeData', {source: this, previous});
    }

    get layoutOnly(): boolean { return this._layoutOnly; }
    setLayoutOnly(value: boolean) {
        const previous = this._layoutOnly;
        if (previous === value) { return; }
        this._layoutOnly = value;
        this.source.trigger('changeLayoutOnly', {source: this, previous});
    }

    get vertices(): ReadonlyArray<Vector> { return this._vertices; }
    setVertices(value: ReadonlyArray<Vector>) {
        const previous = this._vertices;
        if (isPolylineEqual(this._vertices, value)) { return; }
        this._vertices = value;
        this.source.trigger('changeVertices', {source: this, previous});
    }
}

export function linkMarkerKey(linkTypeIndex: number, startMarker: boolean) {
    return `ontodia-${startMarker ? 'mstart' : 'mend'}-${linkTypeIndex}`;
}

export interface FatLinkTypeEvents {
    changeLabel: PropertyChange<FatLinkType, ReadonlyArray<LocalizedString>>;
    changeIsNew: PropertyChange<FatLinkType, boolean>;
    changeVisibility: {
        source: FatLinkType;
        preventLoading: boolean;
    };
}

/**
 * Properties:
 *     visible: boolean
 *     showLabel: boolean
 *     isNew?: boolean
 *     label?: { values: LocalizedString[] }
 */
export class FatLinkType {
    private readonly source = new EventSource<FatLinkTypeEvents>();
    readonly events: Events<FatLinkTypeEvents> = this.source;

    readonly id: LinkTypeIri;

    private _index: number | undefined;

    private _label: ReadonlyArray<LocalizedString>;
    private _isNew = false;

    private _visible = true;
    private _showLabel = true;

    constructor(props: {
        id: LinkTypeIri;
        index?: number;
        label?: ReadonlyArray<LocalizedString>;
    }) {
        const {id, index, label = []} = props;
        this.id = id;
        this._index = index;
        this._label = label;
    }

    get index() { return this._index; }
    setIndex(value: number) {
        if (typeof this._index === 'number') {
            throw new Error('Cannot set index for link type more than once.');
        }
        this._index = value;
    }

    get label() { return this._label; }
    setLabel(value: ReadonlyArray<LocalizedString>) {
        const previous = this._label;
        if (previous === value) { return; }
        this._label = value;
        this.source.trigger('changeLabel', {source: this, previous});
    }

    get visible() { return this._visible; }
    get showLabel() { return this._showLabel; }
    setVisibility(params: {
        visible: boolean;
        showLabel: boolean;
        preventLoading?: boolean;
    }) {
        const same = (
            this._visible === params.visible &&
            this._showLabel === params.showLabel
        );
        if (same) { return; }
        const preventLoading = Boolean(params.preventLoading) || this._visible === params.visible;
        this._visible = params.visible;
        this._showLabel = params.showLabel;
        this.source.trigger('changeVisibility', {source: this, preventLoading});
    }

    get isNew() { return this._isNew; }
    setIsNew(value: boolean) {
        const previous = this._isNew;
        if (previous === value) { return; }
        this._isNew = value;
        this.source.trigger('changeIsNew', {source: this, previous});
    }
}

export class LinkVertex {
    constructor(
        readonly link: Link,
        readonly vertexIndex: number,
    ) {}

    createAt(location: Vector) {
        const vertices = [...this.link.vertices];
        vertices.splice(this.vertexIndex, 0, location);
        this.link.setVertices(vertices);
    }

    moveTo(location: Vector) {
        const vertices = [...this.link.vertices];
        vertices.splice(this.vertexIndex, 1, location);
        this.link.setVertices(vertices);
    }

    remove() {
        const vertices = [...this.link.vertices];
        const [location] = vertices.splice(this.vertexIndex, 1);
        this.link.setVertices(vertices);
    }
}
