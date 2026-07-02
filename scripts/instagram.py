import sys
import json
import os
from instagrapi import Client

def get_script_dir():
    return os.path.dirname(os.path.abspath(__file__))

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "command required: check or fetch"}))
        sys.exit(1)

    cmd = sys.argv[1]
    
    # We use a common session file to avoid logging in every time
    cl = Client()
    script_dir = get_script_dir()
    session_file = os.path.join(script_dir, "ig_session.json")

    # Load session if exists
    if os.path.exists(session_file):
        try:
            cl.load_settings(session_file)
        except:
            pass

    try:
        if cmd == "check":
            # Public lookup (no login required)
            username = sys.argv[2] if len(sys.argv) > 2 else None
            if not username:
                print(json.dumps({"error": "username required"}))
                sys.exit(1)
            
            # info_by_username_gql is a public method in instagrapi
            user_info = cl.user_info_by_username_gql(username)
            
            # Return a simplified version of the user object
            print(json.dumps({
                "valid": True,
                "pk": user_info.pk,
                "username": user_info.username,
                "full_name": user_info.full_name,
                "follower_count": user_info.follower_count,
                "following_count": user_info.following_count,
                "media_count": user_info.media_count,
                "is_private": user_info.is_private,
                "is_verified": user_info.is_verified,
            }))

        elif cmd == "fetch":
            username = sys.argv[2] if len(sys.argv) > 2 else None
            limit = int(sys.argv[3]) if len(sys.argv) > 3 else 20
            if not username:
                print(json.dumps({"error": "username required"}))
                sys.exit(1)

            # fetch requires login. We use proxy credentials from env.
            proxy_user = os.environ.get("IG_PROXY_USERNAME")
            proxy_pass = os.environ.get("IG_PROXY_PASSWORD")

            if not proxy_user or not proxy_pass:
                # If no proxy account, we can't fetch posts. 
                # Fallback to just the public info
                user_info = cl.user_info_by_username_gql(username)
                print(json.dumps({
                    "valid": True,
                    "pk": user_info.pk,
                    "username": user_info.username,
                    "full_name": user_info.full_name,
                    "follower_count": user_info.follower_count,
                    "posts": [],
                    "error": "Proxy account not configured. Only basic info available."
                }))
                sys.exit(0)

            try:
                cl.login(proxy_user, proxy_pass)
            except Exception as e:
                print(json.dumps({"error": f"Login failed: {str(e)}"}))
                sys.exit(1)

            # Save session for next time
            cl.dump_settings(session_file)
            
            user_id = cl.user_id_from_username(username)
            user_info = cl.user_info(username)
            medias = cl.user_medias(user_id, amount=limit)

            posts = []
            for m in medias:
                posts.append({
                    "id": m.pk,
                    "caption": m.caption,
                    "likes": m.like_count,
                    "comments": m.comment_count,
                    "url": m.url,
                    "timestamp": m.timestamp,
                    "media_type": "video" if m.media_type == 2 else "image"
                })

            print(json.dumps({
                "valid": True,
                "pk": user_info.pk,
                "username": user_info.username,
                "full_name": user_info.full_name,
                "follower_count": user_info.follower_count,
                "posts": posts
            }))

        else:
            print(json.dumps({"error": "unknown command"}))
            sys.exit(1)

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()