import * as React from 'react';
import { hcl } from 'd3-color';

import { ElementModel } from '../data/model';
import { DiagramView } from '../diagram/view';
import { formatLocalizedLabel } from '../diagram/model';

export interface ListElementViewProps extends React.HTMLProps<HTMLLIElement> {
    view: DiagramView;
    model: Readonly<ElementModel>;
    disabled?: boolean;
    selected?: boolean;
}

const CLASS_NAME = 'ontodia-list-element-view';

export class ListElementView extends React.Component<ListElementViewProps, {}> {
    render() {
        const {view, model, selected, disabled, ...otherProps} = this.props;

        const {h, c, l} = view.getTypeStyle(model.types).color;
        const frontColor = (selected && !disabled) ? hcl(h, c, l * 1.2) : hcl('white');

        const disabledClass = disabled ? `${CLASS_NAME}--disabled` : '';
        const className = `${CLASS_NAME} ${disabledClass} ${otherProps.className || ''}`;
        const localizedText = formatLocalizedLabel(model.id, model.label.values, view.getLanguage());
        const classesString = view.getElementTypeString(model);

        return <li {...otherProps} className={className} draggable={!disabled}
            title={`${localizedText} ${view.formatIri(model.id)}\nClasses: ${classesString}`}
            style={{background: hcl(h, c, l)}}>
            <div className={`${CLASS_NAME}__label`} style={{background: frontColor}}>
                {localizedText}
            </div>
        </li>;
    }
}
