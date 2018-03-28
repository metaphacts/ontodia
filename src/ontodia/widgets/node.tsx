import * as React from 'react';
import * as _ from 'lodash';

import { Dictionary, LocalizedString } from '../data/model';
import { FatClassModel } from '../diagram/elements';
import { DiagramView } from '../diagram/view';
import { EventObserver } from '../viewUtils/events';
import { formatLocalizedLabel } from '../diagram/model';
import { TreeNodes } from './treeNodes';

require('jstree/dist/themes/default/style.css');

export interface NodeTreeProps {
    node: FatClassModel;
    lang?: Readonly<string> | undefined;
    resultIds?: Array<string> | undefined;
    searchString?: string | undefined;
}

interface ClassTreeState {
    expanded?: Boolean | undefined;
}

const CLASS_NAME = 'ontodia-class-tree';

export class Node extends React.Component<NodeTreeProps, ClassTreeState> {
    constructor(props: NodeTreeProps) {
        super(props);

        this.state = { expanded: false };
        this.toggle = this.toggle.bind(this);
    }

    componentWillReceiveProps(nextProps: NodeTreeProps) {
        const { resultIds } = nextProps;
        if (resultIds) {
            this.setState({ expanded: Boolean(resultIds.find(id => id === this.props.node.id)) });
        } else {
            this.setState({ expanded: false });
        }
    }

    toggle() {
        this.setState({ expanded: !this.state.expanded });
    }
    hasChildren(node: FatClassModel): string{
        if ( node.derived.length !== 0 ) {
            return "parent-tree-icon";
        } else {
            return "default-tree-icon";
        }
    }

    render(): React.ReactElement<any> {
        const { node, resultIds, searchString, lang } = this.props;
        let bold = false;
        if (Boolean(resultIds) && resultIds.length !== 0) {
            for (let i = 0; i < node.label.length; i++) {
                if (node.label[i].text.toUpperCase().indexOf(searchString.toUpperCase()) !== -1) {
                    bold = true;
                }
            }
            if ( node.count.toString().indexOf(searchString.toUpperCase()) !== -1) {
                bold = true;
            }
        }
        return (
            <div>
                <li className={this.hasChildren(node)} role='treeitem' onClick={this.toggle}
                    style={{ fontWeight: bold ? 'bold' : 'normal', listStyleType: 'none' }}>
                    {formatLocalizedLabel(node.id, node.label, lang) + ' (' + node.count + ')' }
                </li>
                <TreeNodes roots={node.derived} expanded={this.state.expanded}
                    resultIds={resultIds} searchString={searchString} lang={lang} />
            </div>
        );
    }
}

export default Node;
