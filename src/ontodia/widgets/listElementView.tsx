import * as React from 'react';
import { hcl } from 'd3-color';

import { ElementModel } from '../data/model';
import { DiagramView } from '../diagram/view';

export interface ListElementViewProps extends React.HTMLProps<HTMLLIElement> {
    view: DiagramView;
    model: Readonly<ElementModel>;
    disabled?: boolean;
    selected?: boolean;
}

const CLASS_NAME = 'ontodia-list-element-view';

export class ListElementView extends React.Component<ListElementViewProps, void> {
    render() {
        const {view, model, selected, disabled, ...otherProps} = this.props;

        const {h, c, l} = view.getTypeStyle(model.types).color;
        const frontColor = (selected && !disabled) ? hcl(h, c, l * 1.2) : hcl('white');

        const disabledClass = disabled ? `${CLASS_NAME}--disabled` : '';
        const className = `${CLASS_NAME} ${disabledClass} ${otherProps.className}`;

        return <li {...otherProps} className={className} draggable={!disabled}
            title={`Classes: ${view.getElementTypeString(model)}`}
            style={{background: hcl(h, c, l)}}>
            <div className={`${CLASS_NAME}__label`} style={{background: frontColor}}>
                {view.getLocalizedText(model.label.values).text}
            </div>
        </li>;
    }
}
