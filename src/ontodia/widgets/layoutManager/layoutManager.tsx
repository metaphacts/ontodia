import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { merge, clone } from 'lodash';
import { Element, Link } from '../../diagram/elements';
import { DiagramModel } from '../../diagram/model';
import { DiagramView } from '../../diagram/view';
import { boundsOf } from '../../diagram/geometry';
import {
    LayoutNode,
    LayoutLink,
    removeOverlaps,
    padded,
    translateToPositiveQuadrant,
    translateToCenter,
} from '../../viewUtils/layout';
import { Dictionary } from '../../data/model';
import { LayouAlgorithm, NumericParameter, Parameter } from './algorithms';

export interface LayoutManagerProps {
    view: DiagramView;
    algorithms: LayouAlgorithm[];
    state?: LayoutManagerState;
}

export interface LayoutManagerState {
    isExpanded?: boolean;
    selectedAlgorithm: LayouAlgorithm;
    interactive?: boolean;
}

const DEFAULT_STATE: LayoutManagerState = {
    selectedAlgorithm: null,
    interactive: false,
};

const ANIMATION_INTERVAL = 50;

export class LayoutManager extends React.Component<LayoutManagerProps, LayoutManagerState> {
    private paramtersMap: Dictionary<Dictionary<Parameter>> = {};
    constructor(props: LayoutManagerProps) {
        super(props);

        const deafaultState = clone(DEFAULT_STATE);
        this.state = merge(defaultStatus, this.props.state);
        this.state.selectedAlgorithm = this.props.algorithms[0];
    }

    private applyCurrentAlgorithm = () => {
        if (!this.state.interactive) {
            this.applyFunction();
        }
    }

    private applyFunction = (interactiveCall?: boolean) => {
        const isSimpleOrFirstCall = !interactiveCall || interactiveCall &&
                                    this.state.selectedAlgorithm.isSupportAnimation;
        const { layoutNodes, layoutLinks } = getLayoutElements(this.props.view.model);
        if (this.state.selectedAlgorithm && isSimpleOrFirstCall) {
            this.state.selectedAlgorithm.apply(
                layoutNodes, layoutLinks, this.state.interactive,
            );
            for (const node of layoutNodes) {
                    this.props.view.model.getElement(node.id).setPosition({x: node.x, y: node.y});
            }
            for (const {link} of layoutLinks) {
                link.setVertices([]);
            }
            this.props.view.performSyncUpdate();
        }
        if (this.state.interactive) {
            setTimeout(() => {
                requestAnimationFrame(() => {
                    this.applyFunction(true);
                });
            }, ANIMATION_INTERVAL);
        }
    }

    private getParameterViews = () => {
        const parametersMap = this.state.selectedAlgorithm.parameters || {};
        const parameters = Object.keys(parametersMap).map((key, index) => {
            const param = parametersMap[key];
            if (param.type === 'boolean') {
                return <div className='layout-parameters-list_boolean-parameter'>
                        <input type='checkbox'
                            checked={param.value}
                            key={this.state.selectedAlgorithm.id + `prop-${index}`}
                            className='layout-parameters-list_boolean-parameter__input'
                            onChange={(event: React.FormEvent<HTMLInputElement>) => {
                                param.value = event.currentTarget.checked;
                            }}
                        />
                        <span className='layout-parameters-list_boolean-parameter__label'>{param.label}</span>
                    </div>;
            } else if (param.type === 'string') {
                return <div className='layout-parameters-list_string-parameter'>
                    <div className='layout-parameters-list_string-parameter__label'>{param.label}</div>
                    <input type='text'
                        value={param.value}
                        key={this.state.selectedAlgorithm.id + `prop-${index}`}
                        className='layout-parameters-list_string-parameter__input'
                        onChange={(event: React.FormEvent<HTMLInputElement>) => {
                            this.state.selectedAlgorithm.setParameter(
                                key, event.currentTarget.value,
                            );
                        }}
                    />
                </div>;
            } else if (param.type === 'number') {
                return <AlgorithmNumericParameter
                    {...param}
                    key={this.state.selectedAlgorithm.id + `prop-${index}`}
                    onChange={(newValue) => { param.value = newValue; }}
                />;
            } else {
                return null;
            }
        });
        if (parameters.length === 0) {
            return null;
        }

        return <div className='layout-algorithm-manager_panel__parameters'>
            <div className='layout-parameters-label'>Parameters</div>
            <ul className='layout-parameters-list'>
                {parameters}
            </ul>
        </div>;
    }

    private onClickInteractive = () => {
        this.state.interactive = !this.state.interactive;
        if (this.state.interactive) {
            this.applyFunction();
        }
        this.setState(this.state);
    }

    private onExpandCollapse = () => {
        this.state.isExpanded = !this.state.isExpanded;
        this.setState(this.state);
    }

    private onSelectAlgorithm = (layouAlgorithm: LayouAlgorithm) => {
        this.state.selectedAlgorithm = layouAlgorithm;
        this.setState(this.state);
    }

    render() {
        const algorithms = this.props.algorithms.map((alg, index) => {
            const {icon, label} = alg.style;
            return <li
                key={`algorithm-${index}`}
                className={alg.id === this.state.selectedAlgorithm.id ? 'selected-layout-algorithm' : ''}
                onClick={() => {this.onSelectAlgorithm(alg); }}
            >
                <span className={icon || ''}></span>{label}
            </li>;
        });

        const {icon, label} = this.state.selectedAlgorithm.style;

        return <div className='layout-algorithm-manager'>
            <button type='button' className='layout-algorithm-manager__button'
                    title='Apply layout' onClick={this.applyCurrentAlgorithm}>
                <span className={icon || ''} aria-hidden='true'/>&nbsp; 
                {label}
            </button>
            <button type='button' className='layout-algorithm-manager__arrow-button'
                    title='See layouts' onClick={this.onExpandCollapse}>
                <span className='fa fa-caret-down' aria-hidden='true'/>
            </button>
            <div
                className={'layout-algorithm-manager_panel' + (this.state.isExpanded ? '' : ' hidden')}
            >   
                <div className='layout-algorithm-manager_panel__title'>Layout manager</div>
                <ul className='layout-algorithm-manager_panel__algorithms'>
                    {algorithms}
                </ul>
                {this.getParameterViews()}
                <div className='layout-algorithm-manager_panel__bottom-line'>
                    <input type='checkbox' checked={this.state.interactive} onClick={this.onClickInteractive}/>
                    <span> interactive</span>
                    <button
                        type='button'
                        className='ontodia-btn ontodia-btn-primary'
                        disabled={this.state.interactive}
                        onClick={this.applyCurrentAlgorithm}
                    >
                        Apply
                    </button>
                </div>
            </div>
        </div>;
    }
}

export interface NumericParameterProps extends NumericParameter {
    onChange?: (newValue: number) => void;
}

export class AlgorithmNumericParameter extends React.Component<NumericParameterProps, { value: number }> {
    constructor(props: NumericParameterProps) {
        super(props);
        this.state = { value: props.value };
    }

    componentWillReceiveProps(newProps: NumericParameterProps) {
        this.state.value = newProps.value;
        this.setState(this.state);
    }

    onChangeValue = (event: React.FormEvent<HTMLInputElement>) => {
        const value = event.currentTarget.value;
        this.state.value = +value;
        this.setState(this.state);
        this.props.onChange(this.state.value);
    }

    render() {
        return <div className='layout-parameters-list_number-parameter'>
            <div className='layout-parameters-list_number-parameter__label'>
                {this.props.label}
            </div>
            <div className='layout-parameters-list_number-parameter_value'>
                <input
                    type='range'
                    min={this.props.min}
                    max={this.props.max}
                    value={`${this.state.value}`}
                    className='layout-parameters-list_number-parameter_value__slider'
                    onChange={this.onChangeValue}
                ></input>
                <input
                    type='number'
                    value={`${this.state.value}`}
                    className='layout-parameters-list_number-parameter_value__input'
                    onInput={this.onChangeValue}
                    onChange={() => { /* */ }}
                ></input>
            </div>
        </div>;
    }
}

function getLayoutElements(model: DiagramModel) {
    const layoutNodes: LayoutNode[] = [];
    const nodeById: { [id: string]: LayoutNode } = {};
    for (const element of model.elements) {
        const {x, y, width, height} = boundsOf(element);
        const node: LayoutNode = {id: element.id, x, y, width, height};
        nodeById[element.id] = node;
        layoutNodes.push(node);
    }

    type LinkWithReference = LayoutLink & { link: Link };
    const layoutLinks: LinkWithReference[] = [];
    for (const link of model.links) {
        if (!model.isSourceAndTargetVisible(link)) { continue; }
        const source = model.sourceOf(link);
        const target = model.targetOf(link);
        layoutLinks.push({
            link,
            source: nodeById[source.id],
            target: nodeById[target.id],
        });
    }

    return { layoutNodes, layoutLinks };
}
