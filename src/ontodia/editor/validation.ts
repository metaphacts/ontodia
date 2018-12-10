import { ElementIri, LinkModel, hashLink, sameLink } from '../data/model';
import { ValidationApi, ValidationEvent, ElementError, LinkError } from '../data/validationApi';
import { CancellationToken } from '../viewUtils/async';
import { HashMap, ReadonlyHashMap, cloneMap } from '../viewUtils/collections';
import { AuthoringState, AuthoringKind } from './authoringState';
import { EditorController } from './editorController';

export interface ValidationState {
    readonly elements: ReadonlyMap<ElementIri, ElementValidation>;
    readonly links: ReadonlyHashMap<LinkModel, LinkValidation>;
}

export interface ElementValidation {
    readonly loading: boolean;
    readonly errors: ReadonlyArray<ElementError>;
}

export interface LinkValidation {
    readonly loading: boolean;
    readonly errors: ReadonlyArray<LinkError>;
}

export namespace ValidationState {
    export const empty: ValidationState = createMutable();
    export const emptyElement: ElementValidation = {loading: false, errors: []};
    export const emptyLink: LinkValidation = {loading: false, errors: []};

    export function createMutable() {
        return {
            elements: new Map<ElementIri, ElementValidation>(),
            links: new HashMap<LinkModel, LinkValidation>(hashLink, sameLink),
        };
    }

    export function setElementErrors(
        state: ValidationState, target: ElementIri, errors: ReadonlyArray<ElementError>
    ): ValidationState {
        const elements = cloneMap(state.elements);
        if (errors.length > 0) {
            elements.set(target, {loading: false, errors});
        } else {
            elements.delete(target);
        }
        return {...state, elements};
    }

    export function setLinkErrors(
        state: ValidationState, target: LinkModel, errors: ReadonlyArray<LinkError>
    ): ValidationState {
        const links = state.links.clone();
        if (errors.length > 0) {
            links.set(target, {loading: false, errors});
        } else {
            links.delete(target);
        }
        return {...state, links};
    }
}

export function changedElementsToValidate(
    previousAuthoring: AuthoringState,
    editor: EditorController,
) {
    const currentAuthoring = editor.authoringState;

    const links = new HashMap<LinkModel, true>(hashLink, sameLink);
    previousAuthoring.index.links.forEach((e, model) => links.set(model, true));
    currentAuthoring.index.links.forEach((e, model) => links.set(model, true));

    const toValidate = new Set<ElementIri>();
    links.forEach((value, linkModel) => {
        const current = currentAuthoring.index.links.get(linkModel);
        const previous = previousAuthoring.index.links.get(linkModel);
        if (current !== previous) {
            toValidate.add(linkModel.sourceId);
        }
    });

    for (const element of editor.model.elements) {
        const current = currentAuthoring.index.elements.get(element.iri);
        const previous = previousAuthoring.index.elements.get(element.iri);
        if (current !== previous) {
            toValidate.add(element.iri);

            // when we remove element incoming link are removed as well so we should update their sources
            if ((current || previous).type === AuthoringKind.DeleteElement) {
                for (const link of element.links) {
                    if (link.data.sourceId !== element.iri) {
                        toValidate.add(link.data.sourceId);
                    }
                }
            }
        }
    }

    return toValidate;
}

export function validateElements(
    targets: ReadonlySet<ElementIri>,
    validationApi: ValidationApi,
    editor: EditorController,
    cancellation: CancellationToken,
) {
    const previousState = editor.validationState;
    const newState = ValidationState.createMutable();

    for (const element of editor.model.elements) {
        if (newState.elements.has(element.iri)) {
            continue;
        }

        const outboundLinks = element.links.reduce((acc: LinkModel[], link) => {
            if (link.sourceId === element.id) {
                acc.push(link.data);
            }
            return acc;
        }, []);

        if (targets.has(element.iri)) {
            const event: ValidationEvent = {
                target: element.data,
                outboundLinks,
                state: editor.authoringState,
                model: editor.model,
                cancellation,
            };
            const result = validationApi.validate(event);

            const loadingElement: ElementValidation = {loading: true, errors: []};
            const loadingLink: LinkValidation = {loading: true, errors: []};
            newState.elements.set(element.iri, loadingElement);
            outboundLinks.forEach(link => newState.links.set(link, loadingLink));

            processValidationResult(result, loadingElement, loadingLink, event, editor);
        } else {
            // use previous state for element and outbound links
            newState.elements.set(element.iri, previousState.elements.get(element.iri));
            for (const link of outboundLinks) {
                newState.links.set(link, previousState.links.get(link));
            }
        }
    }

    editor.setValidationState(newState);
}

async function processValidationResult(
    result: Promise<Array<ElementError | LinkError>>,
    previousElement: ElementValidation,
    previousLink: LinkValidation,
    e: ValidationEvent,
    editor: EditorController,
) {
    let allErrors: Array<ElementError | LinkError>;
    try {
        allErrors = await result;
    } catch (err) {
        // tslint:disable-next-line:no-console
        console.error(`Failed to validate element`, e.target, err);
        allErrors = [{type: 'element', target: e.target.id, message: `Failed to validate element`}];
    }

    const elementErrors: ElementError[] = [];
    const linkErrors = new HashMap<LinkModel, LinkError[]>(hashLink, sameLink);
    e.outboundLinks.forEach(link => linkErrors.set(link, []));

    for (const error of allErrors) {
        if (error.type === 'element' && error.target === e.target.id) {
            elementErrors.push(error);
        } else if (error.type === 'link' && linkErrors.has(error.target)) {
            linkErrors.get(error.target).push(error);
        }
    }

    let state = editor.validationState;
    if (state.elements.get(e.target.id) === previousElement) {
        state = ValidationState.setElementErrors(state, e.target.id, elementErrors);
    }
    linkErrors.forEach((errors, link) => {
        if (state.links.get(link) === previousLink) {
            state = ValidationState.setLinkErrors(state, link, errors);
        }
    });
    editor.setValidationState(state);
}
