import * as React from 'react';

import { ElementTypeIri } from '../data/model';

import { FatClassModel } from '../diagram/elements';
import { formatLocalizedLabel } from '../diagram/model';
import { DiagramView } from '../diagram/view';

import { EditorController } from '../editor/editorController';

import { EventObserver } from '../viewUtils/events';

export interface AuthoringToolsProps {
    editor: EditorController;
    view: DiagramView;
    selectedElementType: FatClassModel;
}

const CLASS_NAME = 'ontodia-authoring-tools';

const DEFAULT_ELEMENT_TYPE = 'http://www.w3.org/2002/07/owl#Thing' as ElementTypeIri;

export class AuthoringTools extends React.Component<AuthoringToolsProps, {}> {
    private readonly listener = new EventObserver();

    constructor(props: AuthoringToolsProps, context: any) {
        super(props, context);
    }

    componentDidMount() {
        const {editor, selectedElementType} = this.props;
        this.listener.listen(editor.events, 'changeAuthoringState', () => {
            this.forceUpdate();
        });
        if (selectedElementType) {
            selectedElementType.events.on('changeLabel', this.onElementTypeLabelChanged);
        }
    }

    componentWillReceiveProps(nextProps: AuthoringToolsProps) {
        if (this.props.selectedElementType !== nextProps.selectedElementType) {
            if (this.props.selectedElementType) {
                this.props.selectedElementType.events.off('changeLabel', this.onElementTypeLabelChanged);
            }
            if (nextProps.selectedElementType) {
                nextProps.selectedElementType.events.on('changeLabel', this.onElementTypeLabelChanged);
            }
        }
    }

    componentWillUnmount() {
        const {selectedElementType} = this.props;
        if (selectedElementType) {
            selectedElementType.events.off('changeLabel', this.onElementTypeLabelChanged);
        }
    }

    private onElementTypeLabelChanged = () => {
        this.forceUpdate();
    }

    render() {
        return (
            <div className={CLASS_NAME}>
                {this.renderNewEntityButton()}
            </div>
        );
    }

    private renderNewEntityButton() {
        const {view, selectedElementType} = this.props;
        if (!selectedElementType) {
            return <div>Select a class to create new entity.</div>;
        }
        const typeLabel = formatLocalizedLabel(selectedElementType.id, selectedElementType.label, view.getLanguage());
        return (
            <button className={`ontodia-btn ontodia-btn-success ${CLASS_NAME}__create-entity`}
                    onClick={this.onCreateNewEntity}>
                + Create new <span className={`${CLASS_NAME}__type-label`}>{typeLabel}</span>
            </button>
        );
    }

    private onCreateNewEntity = () => {
        const {editor} = this.props;
        const element = editor.createNewEntity(this.props.selectedElementType.id);
        editor.setSelection([element]);
        editor.showEditEntityForm(element);
    }
}
