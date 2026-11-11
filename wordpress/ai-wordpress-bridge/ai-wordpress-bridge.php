<?php
/**
 * Plugin Name: AI WordPress Bridge (Private MCP)
 * Description: Restricted REST endpoints for a personally hosted MCP server.
 * Version: 0.3.0
 * Requires PHP: 7.4
 */
if (!defined('ABSPATH')) { exit; }

function awb_v03_check_post($request) {
    $id = absint($request['id']);
    $post = get_post($id);
    if (!$post) return new WP_Error('awb_not_found', 'Post not found', ['status'=>404]);
    return current_user_can('edit_post', $id);
}
function awb_v03_check_content($request) {
    return current_user_can('edit_posts');
}
function awb_v03_fields() {
    return [
        'seo_title'        => '_yoast_wpseo_title',
        'meta_description' => '_yoast_wpseo_metadesc',
        'focus_keyword'    => '_yoast_wpseo_focuskw',
        'canonical'        => '_yoast_wpseo_canonical'
    ];
}
function awb_v03_seo_fields($id) {
    $fields = [];
    foreach (awb_v03_fields() as $public => $key) {
        $fields[$public] = (string) get_post_meta($id, $key, true);
    }
    return $fields;
}
function awb_v03_seo_revision($fields) {
    return hash('sha256', wp_json_encode($fields, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}
function awb_v03_capabilities() {
    return rest_ensure_response([
        'blog_name' => get_bloginfo('name'),
        'url' => home_url('/'),
        'wordpress_version' => get_bloginfo('version'),
        'yoast_active' => defined('WPSEO_VERSION'),
        'elementor_active' => did_action('elementor/loaded') > 0,
        'elementor_writes_enabled' => defined('AWB_ENABLE_ELEMENTOR_WRITES') && AWB_ENABLE_ELEMENTOR_WRITES === true,
        'supported' => ['drafts','yoast_meta','elementor_outline']
    ]);
}
function awb_v03_seo_get($request) {
    $id = absint($request['id']);
    $fields = awb_v03_seo_fields($id);
    return rest_ensure_response([
        'post_id' => $id,
        'status' => get_post_status($id),
        'yoast_active' => defined('WPSEO_VERSION'),
        'fields' => $fields,
        'revision' => awb_v03_seo_revision($fields),
        'page_url' => get_permalink($id)
    ]);
}
function awb_v03_seo_update($request) {
    if (!defined('WPSEO_VERSION')) {
        return new WP_Error('awb_no_yoast', 'Yoast SEO is not active', ['status'=>409]);
    }
    $id = absint($request['id']);
    $post = get_post($id);
    $expected = $request->get_param('expected_revision');
    $prior = awb_v03_seo_fields($id);
    if (!is_string($expected) || !hash_equals(awb_v03_seo_revision($prior), $expected)) {
        return new WP_Error('awb_stale_seo', 'SEO has changed. Fetch seo_get again.', ['status'=>409]);
    }
    if ($post->post_status === 'publish' && $request->get_param('confirm_live_change') !== true) {
        return new WP_Error('awb_confirmation_required', 'Published page SEO requires explicit confirmation', ['status'=>409]);
    }
    $updates = [];
    foreach (awb_v03_fields() as $public => $key) {
        if (!$request->has_param($public)) continue;
        $value = $request->get_param($public);
        if (!is_string($value) || strlen($value) > 500) {
            return new WP_Error('awb_bad_meta', 'Invalid SEO field', ['status'=>400]);
        }
        if ($public === 'canonical' && $value !== '') {
            $scheme = wp_parse_url($value, PHP_URL_SCHEME);
            $host = wp_parse_url($value, PHP_URL_HOST);
            if (!in_array($scheme, ['http','https'], true) || !$host || esc_url_raw($value) !== $value) {
                return new WP_Error('awb_bad_canonical', 'Invalid canonical URL', ['status'=>400]);
            }
        }
        $updates[$key] = sanitize_text_field($value);
    }
    if (!$updates) return new WP_Error('awb_no_changes', 'No SEO updates specified', ['status'=>400]);
    foreach ($updates as $key => $value) update_post_meta($id, $key, $value);
    clean_post_cache($id);
    $current = awb_v03_seo_fields($id);
    return rest_ensure_response([
        'post_id' => $id,
        'updated' => array_keys($updates),
        'fields' => $current,
        'revision' => awb_v03_seo_revision($current),
        'warning' => 'Verify the rendered HTML / Yoast indexables; stored metadata is not identical to rendered head.'
    ]);
}
function awb_v03_update_draft($request) {
    $id = absint($request['id']);
    $post = get_post($id);
    if ($post->post_type !== 'post' || $post->post_status !== 'draft') {
        return new WP_Error('awb_not_draft', 'Only draft blog posts can be edited by this endpoint', ['status'=>409]);
    }
    if ($request->get_param('expected_modified_gmt') !== mysql_to_rfc3339($post->post_modified_gmt)) {
        return new WP_Error('awb_stale_draft', 'Post changed. Read it again before editing.', ['status'=>409]);
    }
    $data = ['ID'=>$id];
    foreach (['title'=>'post_title','content'=>'post_content','excerpt'=>'post_excerpt'] as $field=>$column) {
        if (!$request->has_param($field)) continue;
        $value = $request->get_param($field);
        if (!is_string($value)) return new WP_Error('awb_bad_field', 'Expected string', ['status'=>400]);
        $limit = ($field === 'content') ? 100000 : (($field === 'excerpt') ? 1000 : 240);
        if (strlen($value) > $limit) return new WP_Error('awb_too_long', 'Field too long', ['status'=>400]);
        $data[$column] = $value;
    }
    if (count($data)===1) return new WP_Error('awb_no_changes','No changes sent',['status'=>400]);
    $saved = wp_update_post(wp_slash($data), true);
    if (is_wp_error($saved)) return $saved;
    $after = get_post($id);
    return rest_ensure_response([
        'post_id'=>$id, 'status'=>$after->post_status,
        'modified_gmt'=>mysql_to_rfc3339($after->post_modified_gmt),'link'=>get_permalink($id)
    ]);
}
function awb_v03_get_elementor_data($id) {
    $raw = get_post_meta($id, '_elementor_data', true);
    $data = is_array($raw) ? $raw : json_decode((string)$raw, true);
    return is_array($data) ? $data : null;
}
function awb_v03_elementor_outline($request) {
    if (!did_action('elementor/loaded')) {
        return new WP_Error('awb_no_elementor','Elementor is not active',['status'=>409]);
    }
    $id = absint($request['id']);
    $data = awb_v03_get_elementor_data($id);
    if (!$data) return new WP_Error('awb_no_layout','No Elementor layout on this page',['status'=>404]);
    $out = [];
    $walk = function($nodes) use (&$walk, &$out) {
        foreach ($nodes as $node) {
            if (!is_array($node)) continue;
            $widget = isset($node['widgetType']) ? (string)$node['widgetType'] : '';
            $item = [
                'id' => (string)($node['id'] ?? ''),
                'elType' => (string)($node['elType'] ?? ''),
                'widgetType' => $widget
            ];
            if (in_array($widget, ['heading','text-editor','button'], true)) {
                $settings = isset($node['settings']) && is_array($node['settings']) ? $node['settings'] : [];
                foreach (['title','editor','text'] as $field) {
                    if (isset($settings[$field]) && is_string($settings[$field])) {
                        $item[$field] = wp_html_excerpt(wp_strip_all_tags($settings[$field]), 280);
                    }
                }
            }
            $out[] = $item;
            if (!empty($node['elements']) && is_array($node['elements'])) $walk($node['elements']);
        }
    };
    $walk($data);
    $raw = (string)get_post_meta($id,'_elementor_data',true);
    return rest_ensure_response([
        'post_id'=>$id,
        'layout_hash'=>hash('sha256',$raw),
        'widgets'=>array_slice($out, 0, 100),
        'total_nodes'=>count($out),
        'truncated'=>count($out)>100
    ]);
}
function awb_v03_elementor_text_update($request) {
    if (!(defined('AWB_ENABLE_ELEMENTOR_WRITES') && AWB_ENABLE_ELEMENTOR_WRITES === true)) {
        return new WP_Error('awb_disabled','Elementor writes are disabled',['status'=>403]);
    }
    if (!did_action('elementor/loaded')) return new WP_Error('awb_no_elementor','Elementor inactive',['status'=>409]);
    if ($request->get_param('confirm_change') !== true) return new WP_Error('awb_confirm','Explicit user confirmation needed',['status'=>409]);
    $id = absint($request['id']);
    $raw = (string)get_post_meta($id,'_elementor_data',true);
    if (!hash_equals(hash('sha256',$raw),(string)$request->get_param('expected_hash'))) {
        return new WP_Error('awb_stale_layout','Layout has changed; read it again',['status'=>409]);
    }
    if (get_post_meta($id,'_elementor_edit_mode',true)!=='builder') {
        return new WP_Error('awb_no_builder','Not an Elementor document',['status'=>409]);
    }
    $data=json_decode($raw,true);
    if (!is_array($data)) return new WP_Error('awb_no_layout','Cannot decode Elementor data',['status'=>409]);
    $widget_id=(string)$request->get_param('widget_id');
    $field=(string)$request->get_param('field');
    $value=(string)$request->get_param('value');
    $allowed=['heading'=>['title'],'text-editor'=>['editor'],'button'=>['text']];
    $hits=0;
    $walk=function(&$nodes) use (&$walk,$widget_id,$field,$value,$allowed,&$hits) {
        foreach ($nodes as &$node) {
            if (!is_array($node)) continue;
            if (($node['id']??'')===$widget_id) {
                $widget=$node['widgetType']??'';
                if (in_array($field,$allowed[$widget]??[],true)) {
                    if (!isset($node['settings']) || !is_array($node['settings'])) $node['settings']=[];
                    $node['settings'][$field]=$field==='editor' ? wp_kses_post($value):sanitize_text_field($value);
                    $hits++;
                }
            }
            if (!empty($node['elements']) && is_array($node['elements'])) $walk($node['elements']);
        }
        unset($node);
    };
    $walk($data);
    if ($hits!==1) return new WP_Error('awb_widget_missing','Widget not found uniquely or field not supported',['status'=>409]);
    // Private backup before potentially dangerous write; Elementor compatibility must be tested on staging.
    $backup_key='_awb_elementor_backup_'.gmdate('YmdHis').'_'.wp_generate_password(8,false,false);
    update_post_meta($id,$backup_key,$raw);
    $saved=update_post_meta($id,'_elementor_data',wp_slash(wp_json_encode($data)));
    if ($saved===false) return new WP_Error('awb_save_failed','No Elementor data persisted',['status'=>500]);
    clean_post_cache($id);
    return rest_ensure_response([
        'post_id'=>$id,'updated'=>true,'backup_key'=>$backup_key,
        'warning'=>'Experimental direct Elementor metadata edit. Regenerate CSS/assets and inspect the rendered page manually.'
    ]);
}
add_action('rest_api_init', function() {
    register_rest_route('ai-bridge/v1','/capabilities',[
        'methods'=>'GET','permission_callback'=>'awb_v03_check_content','callback'=>'awb_v03_capabilities'
    ]);
    register_rest_route('ai-bridge/v1','/draft/(?P<id>\d+)',[
        'methods'=>'POST','permission_callback'=>'awb_v03_check_post','callback'=>'awb_v03_update_draft',
        'args'=>['expected_modified_gmt'=>['type'=>'string','required'=>true]]
    ]);
    register_rest_route('ai-bridge/v1','/seo/(?P<id>\d+)',[
        ['methods'=>'GET','permission_callback'=>'awb_v03_check_post','callback'=>'awb_v03_seo_get'],
        ['methods'=>'POST','permission_callback'=>'awb_v03_check_post','callback'=>'awb_v03_seo_update','args'=>[
            'expected_revision'=>['type'=>'string','required'=>true],
            'confirm_live_change'=>['type'=>'boolean','required'=>false]
        ]]
    ]);
    register_rest_route('ai-bridge/v1','/elementor/(?P<id>\d+)',[
        'methods'=>'GET','permission_callback'=>'awb_v03_check_post','callback'=>'awb_v03_elementor_outline'
    ]);
    register_rest_route('ai-bridge/v1','/elementor/(?P<id>\d+)/text',[
        'methods'=>'POST','permission_callback'=>'awb_v03_check_post','callback'=>'awb_v03_elementor_text_update',
        'args'=>[
            'widget_id'=>['type'=>'string','required'=>true,'pattern'=>'^[a-zA-Z0-9_-]{1,64}$'],
            'field'=>['type'=>'string','required'=>true,'enum'=>['title','editor','text']],
            'value'=>['type'=>'string','required'=>true],
            'expected_hash'=>['type'=>'string','required'=>true],
            'confirm_change'=>['type'=>'boolean','required'=>true]
        ]
    ]);
});
