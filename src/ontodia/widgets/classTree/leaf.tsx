import * as React from 'react';

import { DiagramView } from '../../diagram/view';
import { highlightSubstring } from '../listElementView';

import { TreeNode } from './treeModel';

const DEFAULT_LEAF_ICON = require<string>('../../../../images/tree/leaf-default.svg');
const DEFAULT_PARENT_ICON = require<string>('../../../../images/tree/leaf-folder.svg');

interface CommonProps {
    view: DiagramView;
    searchText?: string;
    selectedNode?: TreeNode;
    onSelect?: (node: TreeNode) => void;
}

export interface LeafProps extends CommonProps {
    node: TreeNode;
}

interface State {
    expanded?: boolean;
}

const LEAF_CLASS = 'ontodia-class-leaf';

export class Leaf extends React.Component<LeafProps, State> {
    constructor(props: LeafProps) {
        super(props);
        this.state = {
            expanded: Boolean(this.props.searchText),
        };
    }

    componentWillReceiveProps(nextProps: LeafProps) {
        if (this.props.searchText !== nextProps.searchText) {
            this.setState({
                expanded: Boolean(nextProps.searchText),
            });
        }
    }

    render() {
        const {node, ...otherProps} = this.props;
        const {view, selectedNode, searchText} = otherProps;
        const {expanded} = this.state;

        const toggleClass = (
            node.derived.length === 0 ? `${LEAF_CLASS}__no-toggle` :
            expanded ? `${LEAF_CLASS}__expanded-toggle` :
            `${LEAF_CLASS}__collapsed-toggle`
        );

        let {icon} = view.getTypeStyle([node.model.id]);
        if (!icon) {
            icon = node.derived.length === 0 ? DEFAULT_LEAF_ICON : DEFAULT_PARENT_ICON;
        }

        let bodyClass = `${LEAF_CLASS}__body`;
        if (selectedNode && selectedNode.model === node.model) {
            bodyClass += ` ${LEAF_CLASS}__body--selected`;
        }

        const label = highlightSubstring(
            node.label, searchText, {className: `${LEAF_CLASS}__highlighted-term`}
        );

        return (
            <div className={LEAF_CLASS} role='tree-item'>
                <div className={`${LEAF_CLASS}__row`}>
                    <div className={toggleClass} onClick={this.toggle} role='button' />
                    <a className={bodyClass} href={node.model.id} onClick={this.onClick}>
                        <img className={`${LEAF_CLASS}__icon`} src={icon} />
                        <span className={`${LEAF_CLASS}__label`}>{label}</span>
                        {node.model.count ? (
                            <span className={`${LEAF_CLASS}__count ontodia-badge`}>
                                {node.model.count}
                            </span>
                        ) : null}
                    </a>
                </div>
                {expanded && node.derived.length > 0 ? (
                    <Forest className={`${LEAF_CLASS}__children`}
                        nodes={node.derived}
                        {...otherProps}
                    />
                ) : null}
            </div>
        );
    }

    private onClick = (e: React.MouseEvent<{}>) => {
        e.preventDefault();
        const {node, onSelect} = this.props;
        onSelect(node);
    }

    private toggle = () => {
        this.setState((state): State => ({expanded: !state.expanded}));
    }
}

export interface ForestProps extends CommonProps {
    className?: string;
    nodes: ReadonlyArray<TreeNode>;
}

export class Forest extends React.Component<ForestProps, {}> {
    render() {
        const {nodes, className, ...otherProps} = this.props;
        return (
            <div className={className} role='tree'>
                {nodes.map(node => (
                    <Leaf key={`node-${node.model.id}`} node={node} {...otherProps} />
                ))}
            </div>
        );
    }
}
