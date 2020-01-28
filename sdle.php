<?php
/*
Plugin Name: SDLE
Plugin URI: https://github.com/bmlt-enabled/sdle/
Description: SDLE WordPress Plugin
Author: BMLT Authors
Author URI: https://bmlt.app
Version: 1.0.0
Install: Drop this directory into the "wp-content/plugins/" directory and activate it.
*/
/* Disallow direct access to the plugin file */
if (basename($_SERVER['PHP_SELF']) == basename(__FILE__)) {
    die('Sorry, but you cannot access this page directly.');
}

if (!class_exists("sdleBmlt")) {
    class sdleBmlt
    {

        protected $version;

        public function __construct()
        {
            $this->version = '1.0.0';
            if (is_admin()) {
                // Back end
                add_action("admin_menu", array(&$this, "sdleBmltOptionsPage"));
                add_action("admin_init", array(&$this, "sdleBmltRegisterSettings"));
            } else {
                // Front end
                add_action("wp_enqueue_scripts", array(&$this, "enqueueFrontendFiles"));
                add_shortcode('sdle', array(&$this, "sdleBmltFunc"));
                add_filter('script_loader_tag', array(&$this, "add_async_defer_attribute"), 10, 2);
            }
        }
        public function sdleBmltRegisterSettings()
        {
            add_option('sdleBmltGoogleApiKey', 'Google API Key');
            register_setting('sdleBmltOptionGroup', 'sdleBmltGoogleApiKey', 'sdleBmltCallback');
        }

        public function sdleBmltOptionsPage()
        {
            add_options_page('SDLE BMLT', 'SDLE BMLT', 'manage_options', 'sdle-bmlt', array(&$this, 'sdleBmltAdminOptionsPage'));
        }

        public function enqueueFrontendFiles($hook)
        {
            $googleApiKey = get_option('sdleBmltGoogleApiKey');
            wp_enqueue_style('sdle-bmlt-ui-css', plugins_url('sdle.css', __FILE__), false, $this->version, false);
            wp_enqueue_script('jquery');
            wp_enqueue_script('sdle-bmlt-js', plugins_url('sdle-wp.js', __FILE__), array('jquery'), $this->version, false);
            wp_enqueue_script('googleapis', esc_url( add_query_arg( 'key', $googleApiKey.'&callback=initMap', 'https:////maps.googleapis.com/maps/api/js' )), array(), null, true );
        }

        public function sdleBmltAdminOptionsPage()
        {
            ?>
            <div>
                <h2>SDLE BMLT</h2>
                <form method="post" action="options.php">
                    <?php settings_fields('sdleBmltOptionGroup'); ?>
                    <table>
                        <tr valign="top">
                            <th scope="row"><label for="sdleBmltGoogleApiKey">Google API Key</label></th>
                            <td><input type="text" id="sdleBmltGoogleApiKey" name="sdleBmltGoogleApiKey" value="<?php echo get_option('sdleBmltGoogleApiKey'); ?>" /></td>
                        </tr>
                    </table>
                    <?php  submit_button(); ?>
                </form>
            </div>
            <?php
        }

        public function sdleBmlt()
        {
            $this->__construct();
        }

        function add_async_defer_attribute($tag, $handle) {
            if ( 'googleapis' !== $handle )
                return $tag;
            return str_replace( ' src', ' async defer src', $tag );
        }

        public function sdleBmltFunc($atts = [])
        {
            $content = '
            <div id="tallyBannerContainer">
                <a href="https://github.com/bmlt-enabled/sdle/issues" target="blank">
                    <picture>
                    <source srcset="' . esc_url( plugins_url( 'images/banner-600.png', __FILE__ ) ) .'" media="(max-width: 600px)">
                        <img id="tallyBannerImage" srcset="' . esc_url( plugins_url( 'images/banner.png', __FILE__ ) ) .'">
                    </picture>
                </a>
            </div>
            <div id="search">
                <span id="criteria-box"><input type="text" id="criteria" name="criteria" size="10"><input id="criteria-button" type="button" value="search" onclick="search()"><input id="reset-button" type="button" value="reset" onclick="clearAllMapObjects()"></span>
                <span id="draw-options"><input type="radio" name="draw-options-radio" value="markers" checked="checked"> Markers <input type="radio" name="draw-options-radio" value="polygon"> Polygon <input type="radio" name="draw-options-radio" value="circles"> Circles </span>
                <span id="willingness-distance">/ Willingness: <input id="willingness" type="text" value="30" size="3"> miles</span> / Data Layers: <span id="data-layers-popdensity"><input id="data-layers-popdensity-enabled" type="checkbox" value="false"> Pop. Density </span>
            </div>
            <div id="map" style="height:500px"></div>';
            return $content;
        }
    }
}

if (class_exists("sdleBmlt")) {
    $sdleBmlt_instance = new sdleBmlt();
}
