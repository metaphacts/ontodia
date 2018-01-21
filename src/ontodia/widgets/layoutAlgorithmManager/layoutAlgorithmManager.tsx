import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Element, Link } from '../../diagram/elements';
import { merge, clone } from 'lodash';
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
import { PaperArea } from '../../diagram/paperArea';

export type LayoutFunction = (interactive?: boolean) => void;

export interface LayouAlgorithm {
    id: string;
    label?: string;
    icon?: string;
    supportAnimation?: boolean;
    layoutFunction: LayoutFunction;
}

export interface LayoutAlgorithmManagerProps {
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

export class LayoutAlgorithmManager extends React.Component<LayoutAlgorithmManagerProps, LayoutManagerState> {

    constructor(props: LayoutAlgorithmManagerProps) {
        super(props);

        const deafaultState = clone(DEFAULT_STATE);
        this.state = merge(defaultStatus, this.props.state);
        this.state.selectedAlgorithm = this.props.algorithms[0];
    }

    private onExpandCollapse = () => {
        this.state.isExpanded = !this.state.isExpanded;
        this.setState(this.state);
    }

    private applyCurrentAlgorithm = () => {
        if (!this.state.interactive) {
            this.applyFunction();
        }
    }

    private onClickCheckBox = () => {
        this.state.interactive = !this.state.interactive;
        if (this.state.interactive) {
            this.applyFunction();
        }
        this.setState(this.state);
    }

    private onAlgorithmClick = (layouAlgorithm: LayouAlgorithm) => {
        this.state.selectedAlgorithm = layouAlgorithm;
        this.setState(this.state);
        this.applyCurrentAlgorithm();
    }

    private applyFunction = (interactiveCall?: boolean) => {
        if (
            this.state.selectedAlgorithm &&
            (!interactiveCall || interactiveCall && this.state.selectedAlgorithm.supportAnimation)
        ) {
            this.state.selectedAlgorithm.layoutFunction(this.state.interactive);
        }
        if (this.state.interactive) {
            setTimeout(() => {
                requestAnimationFrame(() => {
                    this.applyFunction(true);
                });
            }, ANIMATION_INTERVAL);
        }
    }

    render() {
        const algorithms = this.props.algorithms.map(alg => {
            return <li
                key={alg.id}
                className={alg.id === this.state.selectedAlgorithm.id ? 'selected-layout-algorithm' : ''}
                onClick={() => {this.onAlgorithmClick(alg); }}
            >
                <span className={alg.icon || ''}></span>{alg.label || alg.id}
            </li>;
        });
        return <div className='layout-algorithm-manager'>
            <button type='button' className='layout-algorithm-manager__button'
                    title='Apply layout' onClick={this.applyCurrentAlgorithm}>
                <span className='fa fa-sitemap' aria-hidden='true'/> Layout
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
                <div>
                    <input type='checkbox' checked={this.state.interactive} onClick={this.onClickCheckBox}/>
                    <span> interactive</span>
                </div>
            </div>
        </div>;
    }
}

