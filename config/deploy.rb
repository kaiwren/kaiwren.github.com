set :application, "kaiwren-website"
set :server_name, "sidu.in"
set :user, "rails"
set :repository,  "git://github.com/kaiwren/website.git"
set :scm, :git
set :scm_username, "git"
set :runner, 'rails'
set :use_sudo, false
set :branch, "master"
set :deploy_via, :remote_cache
set :git_shallow_clone, 1
set :scm_verbose, true
set :use_sudo, false
set :deploy_to, "/var/www/rails/#{application}"
set :chmod755, "config lib"
role :app, server_name
role :web, server_name
set :rails_env, 'production'

namespace :deploy do
  task :start do ; end
  task :stop do ; end
end
