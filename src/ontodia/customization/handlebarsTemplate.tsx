import * as React from 'react';
import { findDOMNode } from 'react-dom';
import { compile as compileTemplate, HandlebarsTemplateDelegate } from 'handlebars';

import { Dictionary, Property } from '../data/model';

import { TemplateProps } from './props';

export interface HandlebarsTemplateProps {
    template: string;
    templateProps: TemplateProps;
    onLoad?: () => void;
}

const HANDLEBARS_HELPERS = {
    getProperty: (props: Dictionary<Property>, id: string) => {
        if (props && props[id]) {
            return props[id].values.map(v => v.text).join(', ');
        } else {
            return undefined;
        }
    },
};

export class HandlebarsTemplate extends React.Component<HandlebarsTemplateProps, void> {
    private compiledTemplate: HandlebarsTemplateDelegate;

    private cancelLoad = () => { /* nothing */ };

    constructor(props: HandlebarsTemplateProps) {
        super(props);
        this.compiledTemplate = compileTemplate(this.props.template);
    }

    render() {
        return <div dangerouslySetInnerHTML={this.renderTemplate()}></div>;
    }

    renderTemplate() {
        const {templateProps} = this.props;
        const html = this.compiledTemplate(templateProps, {helpers: HANDLEBARS_HELPERS});
        return {__html: html};
    }

    componentDidMount() {
        this.subscribeOnLoad();
    }

    componentDidUpdate() {
        this.subscribeOnLoad();
    }

    componentWillUnmount() {
        this.cancelLoad();
    }

    private subscribeOnLoad() {
        this.cancelLoad();
        const {onLoad} = this.props;
        const node = findDOMNode(this) as HTMLElement;
        if (onLoad) {
            let cancelled = false;
            this.cancelLoad = () => cancelled = true;
            this.subscribeOnImagesLoad(node).then(() => {
                if (!cancelled) { onLoad(); }
            });
        }
    }

    private subscribeOnImagesLoad(node: HTMLElement) {
        const loadingImages: Promise<void>[] = [];
        const images = node.querySelectorAll('img');
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            const loadPromise = whenImageLoad(image);
            if (loadPromise) { loadingImages.push(loadPromise); }
        }
        return Promise.all(loadingImages).then(() => { /* nothing*/ });
    }
}

function whenImageLoad(image: HTMLImageElement): Promise<void> | undefined {
    if (image.complete) { return undefined; }
    return new Promise<void>(resolve => {
        let removeListeners: () => void;
        const loadListener = () => {
            removeListeners();
            resolve();
        };
        const errorListener = () => {
            removeListeners();
            resolve();
        };
        removeListeners = () => {
            image.removeEventListener('load', loadListener, true);
            image.removeEventListener('error', loadListener, true);
        };
        image.addEventListener('load', loadListener, true);
        image.addEventListener('error', errorListener, true);
    });
}
