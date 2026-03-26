#!/usr/bin/env python3

import base64
import until as utils
import logging
import requests
import traceback
import os
import random
import signal

from lib.lib import BaseChecker, CheckResult, get_flag, set_flagid, load_state, run_check, store_state

CUR_DIR = os.path.dirname(os.path.realpath(__file__))

class ExampleChecker(BaseChecker):

    def place_flag(self, tick):
        flag = get_flag(tick).encode()
        session = requests.session()
        # Use fixed user for consistent flag placement
        username = 'hades'
        password = 'password'

        # Register or get existing user
        try:
            utils.check_register(self, session, username, password)
        except Exception as e:
            logging.error("Register failed!\n" + str(e))
            return CheckResult.FAULTY

        # Login
        try:
            utils.check_login(self, session, username, password)
        except Exception as e:
            logging.error("Login failed!\n" + str(e))
            return CheckResult.FAULTY
        if tick % 5 == 1:
            flag_image = utils.create_image_with_obv_flag(flag)
        else:
            flag_image = utils.create_image_with_flag(flag)
        try:
            utils.upload_private_image(self, session, flag_image)
        except Exception as e:
            logging.error("Uploading failed!\n" + str(e))
            return CheckResult.FAULTY
        
        # Fetch the uploaded image back from server to verify and store exact server representation
        try:
            resp_text_orig = utils.get_view(self, session, username)
            resp_text = resp_text_orig.split("<img")
            if len(resp_text) < 3:
                logging.error("Could not find uploaded image in view")
                return CheckResult.FAULTY
            
            resp_text = resp_text[2].split("base64, ")
            if len(resp_text) < 2:
                logging.error("Could not find base64 image data")
                return CheckResult.FAULTY
            
            resp_text = resp_text[1].split(" />")[0]
            resp_text = resp_text.rstrip('"').encode("utf-8")
            stored_image = base64.decodebytes(resp_text)
            
            # Store the image as the server returned it
            store_state(f"flag{tick}Image", stored_image)
        except Exception as e:
            logging.error("Failed to verify uploaded image!\n" + str(e) + "\n" + traceback.format_exc())
            return CheckResult.FAULTY
        
        set_flagid(username)
        return CheckResult.OK

    def check_service(self):
        class TimeoutException(Exception):
            pass

        def handler(*args):
            raise TimeoutException()

        signal.signal(signal.SIGALRM, handler)
        try:
            signal.alarm(40)
            return self._check_service_internal()
        except TimeoutException:
            logging.error("check_service timed out")
            return CheckResult.FAULTY
        finally:
            signal.alarm(0)

    def _check_service_internal(self):
        session = requests.session()
        username = utils.generate_name()
        password = utils.generate_password()
        try:
            utils.check_register(self, session, username, password)
        except Exception as e:
            logging.error("Register failed!\n" + str(e))
            return CheckResult.FAULTY
        try:
            utils.check_login(self, session, username, password)
        except Exception as e:
            logging.error("Login failed!\n" + str(e))
            return CheckResult.FAULTY
        try:
            pub_imgs = utils.get_feed_pic_nums(self)
        except Exception as e:
            logging.error("Getting feed failed!\n" + str(e))
            return CheckResult.FAULTY
        if random.randint(0,1) == 1:
            logging.info("Checking Pub Img upload.")
            # Uploading Pub image
            pub_img = utils.create_rand_png_no_save()
            pub_bytes = utils.fromPILImageToBytes(pub_img)
            try:
                utils.upload_public_image(self, session, pub_bytes)
            except Exception as e:
                logging.error("Failed uploading a public image!\n" + str(e))
                return CheckResult.FAULTY
            # Checking for public image
            pub_base64 = utils.imageToStr(pub_bytes)
            non_session = requests.session()
            try:
                view = utils.get_view(self, non_session, username)
                if view.find(pub_base64) == -1:
                    logging.error("Couldnt find uploaded public image.")
                    return CheckResult.FAULTY
            except ValueError as e:
                logging.error(f"{e}")
                return CheckResult.FAULTY

        if random.randint(0,1) == 1:
            logging.info("Checking Priv Img upload.")
            # Uploading private image
            priv_img = utils.create_rand_png_no_save()
            priv_bytes = utils.fromPILImageToBytes(priv_img)
            try:
                utils.upload_private_image(self, session, priv_bytes)
            except Exception as e:
                logging.error("Failed uploading a private image!\n" + str(e))
                return CheckResult.FAULTY
            # Checking for private image
            priv_base64 = utils.imageToStr(priv_bytes)
            try:
                view = utils.get_view(self, session, username)
                if view.find(priv_base64) == -1:
                    logging.error("Couldnt find uploaded private image.")
                    return CheckResult.FAULTY
            except ValueError as e:
                logging.error(f"{e}")
                return CheckResult.FAULTY

        if random.randint(0,1) == 1 and pub_imgs != None:
            logging.info("Checking pub Comment posting.")
            # Posting Comment under pub
            comment_on = random.choice(pub_imgs)
            comment = utils.generate_comment()
            try:
                utils.post_comment(self, session, comment_on, comment)
            except Exception as e:
                logging.error("Failed posting a comment!\n" + str(e))
                return CheckResult.FAULTY
            # Checking Comment under pub
            try:
                non_session = requests.session()
                img_site = utils.get_pub_img(self, non_session, comment_on)
            except Exception as e:
                logging.error("Failed getting a public image!\n" + str(e))
                return CheckResult.FAULTY
            if img_site.find(comment) == -1:
                logging.error("Failed posting a comment")
                return CheckResult.FAULTY

        if random.randint(0,1) == 1:
            logging.info("Checking changing password.")
            try:
                password = utils.update_password(self, session, password)
            except Exception as e:
                logging.error("Failed updating password!\n" + str(e))
                return CheckResult.FAULTY
            non_session = requests.session()
            try:
                utils.check_login(self, non_session, username, password)
            except Exception as e:
                logging.error("Login failed after password change!\n" + str(e))
                return CheckResult.FAULTY

        if random.randint(0,1) == 1:
            logging.info("Checking changing username.")
            try:
                username = utils.update_username(self, session, password)
            except Exception as e:
                logging.error("Failed updating username!\n" + str(e))
                return CheckResult.FAULTY
            non_session = requests.session()
            try:
                utils.check_login(self, non_session, username, password)
            except Exception as e:
                logging.error("Login failed after username change!\n" + str(e))
                return CheckResult.FAULTY

        if random.randint(0,1) == 1:
            logging.info("Checking upadting profile picture.")
            # Uploading Profile image
            profile_img = utils.create_rand_png_no_save()
            profile_bytes = utils.fromPILImageToBytes(profile_img)
            try:
                utils.update_profilePicture(self, session, profile_bytes)
            except Exception as e:
                logging.error("Failed update the profile image!\n" + str(e))
                return CheckResult.FAULTY
            # Checking for profile image
            profile_base64 = utils.imageToStr(profile_bytes)
            non_session = requests.session()
            try:
                view = utils.get_view(self, non_session, username)
                if view.find(profile_base64) == -1:
                    logging.error("Couldnt find uploaded profile image")
                    return CheckResult.FAULTY
            except ValueError as e:
                logging.error(f"{e}")
                return CheckResult.FAULTY

        utils.logout(self)
        return CheckResult.OK

    def check_flag(self, tick):
        # Use fixed hades user
        username = 'hades'
        password = 'password'
        
        try:
            session = requests.session()
            utils.check_login(self, session, username, password)
            resp_text_orig = utils.get_view(self, session, username)
            flag_image = load_state(f"flag{tick}Image")
            
            if not flag_image:
                logging.error(f"Flag image not found for tick {tick}")
                return CheckResult.FLAG_NOT_FOUND
            
            # Extract image from HTML response (adjust parsing as needed)
            resp_text = resp_text_orig.split("<img")
            if len(resp_text) < 3:
                logging.error("Invalid response structure - not enough img tags")
                return CheckResult.FLAG_NOT_FOUND
                
            resp_text = resp_text[2].split("base64, ")
            if len(resp_text) < 2:
                logging.error("No base64 image data found")
                return CheckResult.FLAG_NOT_FOUND
                
            resp_text = resp_text[1].split(" />")[0]
            resp_text = resp_text.rstrip('"').encode("utf-8")
            img_bytes = base64.decodebytes(resp_text)
            print(img_bytes)
        except Exception as e:
            logging.error("Failed to get checker view!\n" + str(e) + "\n" + traceback.format_exc())
            return CheckResult.FLAG_NOT_FOUND
            
        if img_bytes != flag_image:
            logging.error(f"Image mismatch for tick {tick}")
            return CheckResult.FLAG_NOT_FOUND
        return CheckResult.OK


if __name__ == '__main__':
    if not os.path.exists(CUR_DIR + "/images/"):
        os.makedirs(CUR_DIR + "/images/")
    if not os.path.exists(CUR_DIR + "/flags/"):
        os.makedirs(CUR_DIR + "/flags/")
    run_check(ExampleChecker)