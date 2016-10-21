export const DefaultElementTemplate = `
<div class="ontodia-default-template" style="background-color: {{color}};">
    <div class="ontodia-default-template_type-line">
        <div class="
            {{icon}}
            ontodia-default-template_type-line__icon"
            aria-hidden="true">
        </div>
        <div title="{{types}}" class="ontodia-default-template_type-line_text-container">
            <div class="ontodia-default-template_type-line_text-container__text">{{types}}</div>
        </div>
    </div>
    {{#if imgUrl}}
        <img src="{{imgUrl}}" class="ontodia-default-template__image" style="border-color: {{color}};"/>
    {{/if}}
    <div class="ontodia-default-template_body">
        <label class="ontodia-default-template_body__label" title="{{label}}">
            {{label}}
        </label>
        {{#if isExpanded}}
            <div class="ontodia-default-template_body_expander">
                <div class="ontodia-default-template_body_expander__iri_label">
                    IRI:
                </div>
                <div class="ontodia-default-template_body_expander_iri">
                    <a class="ontodia-default-template_body_expander_iri__link" href="{{iri}}" title="{{iri}}">
                        {{iri}}
                    </a>
                </div>
            </div>
            
            <hr class="ontodia-default-template_body_expander__hr">
            {{#if propsAsList.length}}
                <div class="ontodia-default-template_body_expander_property-table">
                    {{#each propsAsList}}
                        <div  class="ontodia-default-template_body_expander_property-table_row">
                            <div class="ontodia-default-template_body_expander_property-table_row__key"
                                title="{{id}}">
                                {{name}}
                            </div>
                            <div class="ontodia-default-template_body_expander_property-table_row_key_values">
                                {{#each properties}}
                                    <div 
                                    class="ontodia-default-template_body_expander_property-table_row_key_values__value"
                                    title="{{value.text}}">
                                        {{value.text}}
                                    </div>
                                {{/each}}
                            </div>
                        </div>
                    {{/each}}
                </div>
            {{else}}
                no properties
            {{/if}}
        {{/if}}        
    </div>
</div>
`;

export const LeftBarTemplate = `
    <div class="ontodia-left-bar-template"
         style="background-color: {{color}}; border-color: {{color}}">
        <div class="ontodia-left-bar-template_body" style="border-left-color: {{color}}">
            {{#if imgUrl}}
                <img src="{{imgUrl}}" class="ontodia-left-bar-template_body__image"/>
            {{/if}}
            <div class="ontodia-left-bar-template_body_type-line">
                <div class="{{icon}} ontodia-left-bar-template_body_type-line__icon" 
                    aria-hidden="true" 
                    style="color: {{color}};">
                </div>
                <div title="{{types}}" class="ontodia-left-bar-template_body_type-line__type">
                    {{types}}
                </div>
            </div>
            <label title="{{label}}" class="ontodia-left-bar-template_body__label">
                {{label}}
            </label>
            {{#if isExpanded}}
                <div class="ontodia-default-template_body_expander">
                    <div class="ontodia-default-template_body_expander__iri_label">
                        IRI:
                    </div>
                    <div class="ontodia-default-template_body_expander_iri">
                        <a class="ontodia-default-template_body_expander_iri__link" href="{{iri}}" title="{{iri}}">
                            {{iri}}
                        </a>
                    </div>
                </div>
                
                <hr class="ontodia-default-template_body_expander__hr">
                {{#if propsAsList.length}}
                    <div class="ontodia-default-template_body_expander_property-table">
                        {{#each propsAsList}}
                            <div  class="ontodia-default-template_body_expander_property-table_row">
                                <div class="ontodia-default-template_body_expander_property-table_row__key"
                                    title="{{id}}">
                                    {{name}}
                                </div>
                                <div class="ontodia-default-template_body_expander_property-table_row_key_values">
                                    {{#each properties}}
                                    <div 
                                    class="ontodia-default-template_body_expander_property-table_row_key_values__value"
                                        title="{{value.text}}">
                                        {{value.text}}
                                    </div>
                                    {{/each}}
                                </div>
                            </div>
                        {{/each}}
                    </div>
                {{else}}
                    no properties
                {{/if}}
            {{/if}}
        </div>
    </div>
`;

export const BigIconTemplate = `
<div class="ontodia-big-icon-container">
    <div class="ontodia-big-icon-template" 
        style="background-color: {{color}}; border-color: {{color}}">
        <div class="ontodia-big-icon-template_body" style="border-left-color: {{color}}">
            <div style="flex-grow: 1;">
                <label title="{{label}}" class="ontodia-big-icon-template_body__label">
                    {{label}}
                </label>
                <div title="{{types}}" class="ontodia-big-icon-template_body_type-container">
                    <div class="ontodia-big-icon-template_body_type-container__type">{{types}}</div>
                </div>
            </div>
            <div class="{{icon}} ontodia-big-icon-template_body__icon" aria-hidden="true" 
                style="color: {{color}}">
            </div>
        </div>
    </div>
    {{#if isExpanded}}
        <div class="ontodia-big-icon-template_property" style="border-color: {{color}}">
        {{#if imgUrl}}
            <img src="{{imgUrl}}" 
                class="ontodia-big-icon-template_property__image" 
                style="border-color: {{color}}"
            />
        {{/if}}
        <div class="ontodia-big-icon-template_property_content">
            <div class="ontodia-big-icon-template_property_content_iri-line">
                <div class="ontodia-big-icon-template_property_content_iri-line__label">
                    IRI:
                </div>
                <div class="ontodia-big-icon-template_property_content_iri-line__iri">
                    <a href="{{iri}}" title="{{iri}}">{{iri}}</a>
                </div>
            </div>
            
            <hr class="ontodia-big-icon-template_property_content__hr">
            {{#if propsAsList.length}}
                <div class="ontodia-big-icon-template_property_content_property-table">
                    {{#each propsAsList}}
                        <div  class="ontodia-big-icon-template_property_content_property-table_row">
                            <div class="ontodia-big-icon-template_property_content_property-table_row__key"
                                title="{{id}}">
                                {{name}}
                            </div>
                            <div class="ontodia-big-icon-template_property_content_property-table_row_key_values">
                                {{#each properties}}
                                    <div 
                                class="ontodia-big-icon-template_property_content_property-table_row_key_values__value"
                                    title="{{value.text}}">
                                        {{value.text}}
                                    </div>
                                {{/each}}
                            </div>
                        </div>
                    {{/each}}
                </div>
            {{else}}
                no properties
            {{/if}}
        </div>
        </div>
    {{/if}}
</div>  
`;

export const PersonTemplate = `
<div class="ontodia-person-container">
    <div class="ontodia-person-template" 
        style="background-color: {{color}}; border-color: {{color}}">
        <div class="ontodia-person-template_body" style="border-left-color: {{color}}">
            {{#if imgUrl}}
                <div class="ontodia-person-template_body_photo" aria-hidden="true" style="color: {{color}}">
                    <img 
                        src="{{imgUrl}}" 
                        class="ontodia-person-template_body_photo__image" 
                        style="border-color: {{color}}"
                    />
                </div>
            {{else}}
                <div class="{{icon}} ontodia-person-template_body__icon" aria-hidden="true" 
                    style="color: {{color}}">
                </div>
            {{/if}}
            <div class="ontodia-person-template_body_main-part">
                <div title="{{types}}" class="ontodia-person-template_body_main-part_type-container">
                    <div class="ontodia-person-template_body_main-part_type-container__type">Person</div>
                </div>
                <label title="{{label}}" class="ontodia-person-template_body_main-part__label">
                {{#if (getProperty props "http://xmlns.com/foaf/0.1/name") }}
                    <label title="{{getProperty props "http://xmlns.com/foaf/0.1/name" }}" 
                        class="ontodia-person-template_body_main-part__label">
                        
                        {{getProperty props "http://xmlns.com/foaf/0.1/name" }}
                    </label>
                {{else}}
                    <label title="{{label}}" class="ontodia-person-template_body_main-part__label">
                        {{label}}
                    </label>
                {{/if}}  
            </div>
        </div>
    </div>
    {{#if isExpanded}}
        <div class="ontodia-person-template_property" style="border-color: {{color}}">
        {{#if imgUrl}}
            <img src="{{imgUrl}}" 
                class="ontodia-person-template_property__image" 
                style="border-color: {{color}}"
            />
        {{/if}}
        <div class="ontodia-person-template_property_content">
            <div class="ontodia-person-template_property_content_iri-line">
                <div class="ontodia-person-template_property_content_iri-line__label">
                    IRI:
                </div>
                <div class="ontodia-person-template_property_content_iri-line__iri">
                    <a href="{{iri}}" title="{{iri}}">{{iri}}</a>
                </div>
            </div>
            
            <hr class="ontodia-person-template_property_content__hr">
            {{#if propsAsList.length}}
                <div class="ontodia-person-template_property_content_property-table">
                    {{#each propsAsList}}
                        <div  class="ontodia-person-template_property_content_property-table_row">
                            <div class="ontodia-person-template_property_content_property-table_row__key"
                                title="{{id}}">
                                {{name}}
                            </div>
                            <div class="ontodia-person-template_property_content_property-table_row_key_values">
                                {{#each properties}}
                                    <div 
                                class="ontodia-person-template_property_content_property-table_row_key_values__value"
                                    title="{{value.text}}">
                                        {{value.text}}
                                    </div>
                                {{/each}}
                            </div>
                        </div>
                    {{/each}}
                </div>
            {{else}}
                no properties
            {{/if}}
        </div>
        </div>
    {{/if}}
</div>  
`;

export const OrganizationTemplate = `
<div class="ontodia-organization-template" style="border-color: {{color}}">
    <div class="ontodia-organization-template_body">
        <div 
            class="{{icon}} ontodia-organization-template_body__logo"
            aria-hidden="true"
            style="color: {{color}};">
        </div>
        <div class="ontodia-organization-template_body_data">
            <div title="{{types}}" class="ontodia-organization-template_body_data__types">
                Organization
            </div>
            {{#if (getProperty props "http://xmlns.com/foaf/0.1/name") }}
                <label title="{{getProperty props "http://xmlns.com/foaf/0.1/name" }}" 
                    class="ontodia-organization-template_body_data__label">
                
                    {{getProperty props "http://xmlns.com/foaf/0.1/name" }}
                </label>
            {{else}}
                <label title="{{label}}" class="ontodia-organization-template_body_data__label">
                    {{label}}
                </label>
            {{/if}}  
        </div>
        <div>
        {{#if isExpanded}}
            <div class="ontodia-default-template_body_expander">
                <div class="ontodia-default-template_body_expander__iri_label">
                    IRI:
                </div>
                <div class="ontodia-default-template_body_expander_iri">
                    <a class="ontodia-default-template_body_expander_iri__link" href="{{iri}}" title="{{iri}}">
                        {{iri}}
                    </a>
                </div>
            </div>
            
            <hr class="ontodia-default-template_body_expander__hr">
            {{#if propsAsList.length}}
                <div class="ontodia-default-template_body_expander_property-table">
                    {{#each propsAsList}}
                        <div  class="ontodia-default-template_body_expander_property-table_row">
                            <div class="ontodia-default-template_body_expander_property-table_row__key"
                                title="{{id}}">
                                {{name}}
                            </div>
                            <div class="ontodia-default-template_body_expander_property-table_row_key_values">
                                {{#each properties}}
                                    <div 
                                    class="ontodia-default-template_body_expander_property-table_row_key_values__value"
                                    title="{{value.text}}">
                                        {{value.text}}
                                    </div>
                                {{/each}}
                            </div>
                        </div>
                    {{/each}}
                </div>
            {{else}}
                no properties
            {{/if}}
        {{/if}}
        </div>  
   </div>
</div>
`;
