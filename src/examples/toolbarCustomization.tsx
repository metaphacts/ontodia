import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, DemoDataProvider, ToolbarProps } from '../index';
import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

const CLASSES = require<any>('./resources/classes.json');
const LINK_TYPES = require<any>('./resources/linkTypes.json');
const ELEMENTS = require<any>('./resources/elements.json');
const LINKS  = require<any>('./resources/links.json');

export interface Props extends ToolbarProps {
    onExampleClick?: () => void;
}

const CLASS_NAME = 'ontodia-toolbar';

export class Toolbar extends React.Component<Props, {}> {
    render() {
        return (
            <div className={CLASS_NAME}>
                <div className='ontodia-btn-group ontodia-btn-group-sm'
                     data-position='bottom' data-step='6'>
                    <span className={`${CLASS_NAME}__layout-group`}>
                        <label className='ontodia-label'><span>Layout - </span></label>
                        <span className='ontodia-btn-group ontodia-btn-group-sm'>
                            <button type='button' className='ontodia-btn ontodia-btn-default'
                                    onClick={this.props.onForceLayout}>
                                <span title='Force layout' className='fa fa-snowflake-o' aria-hidden='true' />
                            </button>
                            <button type='button' className='ontodia-btn ontodia-btn-default'
                                    onClick={this.props.onExampleClick}>
                                <span title='Example button'>Exapmle button</span>
                            </button>
                        </span>
                    </span>
                </div>
            </div>
        );
    }
}

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const model = workspace.getModel();

    const diagram = tryLoadLayoutFromLocalStorage();
    model.importLayout({
        dataProvider: new DemoDataProvider(CLASSES, LINK_TYPES, ELEMENTS, LINKS),
        diagram,
        validateLinks: true,
    });
}

const props: WorkspaceProps & React.ClassAttributes<Workspace> = {
    ref: onWorkspaceMounted,
    onSaveDiagram: workspace => {
        const diagram = workspace.getModel().exportLayout();
        window.location.hash = saveLayoutToLocalStorage(diagram);
        window.location.reload();
    },
    toolbar: <Toolbar onExampleClick={() => { alert('Example button have been pressed!'); }}/>,
};

onPageLoad(container => ReactDOM.render(React.createElement(Workspace, props), container));
